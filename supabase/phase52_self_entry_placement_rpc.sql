-- Phase 52: Self-entry placement under scoped RLS (phase51)
-- Run AFTER phase51_organizer_read_isolation.sql
--
-- computeSelfEntryPlacement() needs to read the full acceptance list to
-- cascade by rank, but phase51 hides other players' rows during setup.
-- This SECURITY DEFINER RPC runs the same cascade math server-side and
-- returns only the placement plan (not the full entry list).

create or replace function public.compute_self_entry_placement(
  p_event_id uuid,
  p_ranking_rank int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event record;
  v_max_main int;
  v_max_qual int;
  v_draw_size int;
  v_qual_size int;
  v_rank int;
  v_main jsonb := '[]'::jsonb;
  v_qual jsonb := '[]'::jsonb;
  v_alt jsonb := '[]'::jsonb;
  v_row record;
  v_main_count int;
  v_worst_main record;
  v_worst_qual record;
  v_taken int[];
  v_pos int;
  v_alt_pos int;
  v_bumps jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_event
  from public.events
  where id = p_event_id;

  if not found then
    raise exception 'Event not found';
  end if;

  if coalesce(v_event.entries_open, false) is not true then
    raise exception 'Entries are not open for this event';
  end if;

  v_draw_size := coalesce(v_event.draw_size, 32);
  v_qual_size := coalesce(v_event.qualifying_size, 32);
  v_max_main := coalesce(v_event.max_main_direct, v_draw_size - 9);
  v_max_qual := coalesce(v_event.max_qual_direct, v_qual_size - 4);
  v_rank := p_ranking_rank;

  for v_row in
    select id, position, ranking
    from public.draw_entries
    where event_id = p_event_id
      and draw_type = 'main'
      and is_alternate = false
      and entry_status <> 'withdrawn'
      and is_bye = false
  loop
    v_main := v_main || jsonb_build_object('id', v_row.id, 'position', v_row.position, 'ranking', v_row.ranking);
  end loop;

  for v_row in
    select id, position, ranking
    from public.draw_entries
    where event_id = p_event_id
      and draw_type = 'qualifying'
      and is_alternate = false
      and entry_status <> 'withdrawn'
      and is_bye = false
  loop
    v_qual := v_qual || jsonb_build_object('id', v_row.id, 'position', v_row.position, 'ranking', v_row.ranking);
  end loop;

  for v_row in
    select id, position, ranking
    from public.draw_entries
    where event_id = p_event_id
      and draw_type = 'main'
      and is_alternate = true
      and entry_status <> 'withdrawn'
      and is_bye = false
  loop
    v_alt := v_alt || jsonb_build_object('id', v_row.id, 'position', v_row.position, 'ranking', v_row.ranking);
  end loop;

  v_main_count := jsonb_array_length(v_main);

  -- No qualifying draw — main + alternates only
  if coalesce(v_event.has_qualifying, false) is not true then
    if v_main_count < v_draw_size then
      select coalesce(min(s), 1) into v_pos
      from generate_series(1, v_draw_size) s
      where not exists (
        select 1 from jsonb_array_elements(v_main) e
        where (e->>'position')::int = s
      );
      return jsonb_build_object(
        'draw_type', 'main',
        'position', v_pos,
        'is_alternate', false,
        'bumps', '[]'::jsonb
      );
    end if;

    select e into v_worst_main
    from jsonb_array_elements(v_main) e
    order by coalesce((e->>'ranking')::int, 2147483647) desc
    limit 1;

    if v_worst_main is not null
       and v_rank is not null
       and v_rank < coalesce((v_worst_main->>'ranking')::int, 2147483647) then
      v_alt_pos := greatest(v_draw_size, coalesce((
        select max((e->>'position')::int) from jsonb_array_elements(v_alt) e
      ), 0)) + 1;
      loop
        exit when not exists (
          select 1 from jsonb_array_elements(v_alt) e
          where (e->>'position')::int = v_alt_pos
        );
        v_alt_pos := v_alt_pos + 1;
      end loop;

      return jsonb_build_object(
        'draw_type', 'main',
        'position', (v_worst_main->>'position')::int,
        'is_alternate', false,
        'bumps', jsonb_build_array(jsonb_build_object(
          'id', v_worst_main->>'id',
          'draw_type', 'main',
          'position', v_alt_pos,
          'is_alternate', true
        ))
      );
    end if;

    v_alt_pos := greatest(v_draw_size, coalesce((
      select max((e->>'position')::int) from jsonb_array_elements(v_alt) e
    ), 0)) + 1;
    loop
      exit when not exists (
        select 1 from jsonb_array_elements(v_alt) e
        where (e->>'position')::int = v_alt_pos
      );
      v_alt_pos := v_alt_pos + 1;
    end loop;

    return jsonb_build_object(
      'draw_type', 'main',
      'position', v_alt_pos,
      'is_alternate', true,
      'bumps', '[]'::jsonb
    );
  end if;

  -- With qualifying — simplified cascade: mirror nominationSort.js outcomes
  if v_main_count < v_max_main then
    select coalesce(min(s), 1) into v_pos
    from generate_series(1, v_draw_size) s
    where not exists (
      select 1 from jsonb_array_elements(v_main) e
      where (e->>'position')::int = s
    );
    return jsonb_build_object(
      'draw_type', 'main',
      'position', v_pos,
      'is_alternate', false,
      'bumps', '[]'::jsonb
    );
  end if;

  select e into v_worst_main
  from jsonb_array_elements(v_main) e
  order by coalesce((e->>'ranking')::int, 2147483647) desc
  limit 1;

  if v_worst_main is not null
     and v_rank is not null
     and v_rank < coalesce((v_worst_main->>'ranking')::int, 2147483647) then
    -- Bump worst main into qualifying (or alternates if qual full)
    if jsonb_array_length(v_qual) < v_max_qual then
      select coalesce(min(s), 1) into v_pos
      from generate_series(1, v_qual_size) s
      where not exists (
        select 1 from jsonb_array_elements(v_qual) e
        where (e->>'position')::int = s
      );
      v_bumps := jsonb_build_array(jsonb_build_object(
        'id', v_worst_main->>'id',
        'draw_type', 'qualifying',
        'position', v_pos,
        'is_alternate', false
      ));
    else
      select e into v_worst_qual
      from jsonb_array_elements(v_qual) e
      order by coalesce((e->>'ranking')::int, 2147483647) desc
      limit 1;

      if v_worst_qual is not null
         and coalesce((v_worst_main->>'ranking')::int, 2147483647)
            < coalesce((v_worst_qual->>'ranking')::int, 2147483647) then
        v_alt_pos := greatest(v_draw_size, coalesce((
          select max((e->>'position')::int) from jsonb_array_elements(v_alt) e
        ), 0)) + 1;
        loop
          exit when not exists (
            select 1 from jsonb_array_elements(v_alt) e
            where (e->>'position')::int = v_alt_pos
          );
          v_alt_pos := v_alt_pos + 1;
        end loop;
        v_bumps := jsonb_build_array(
          jsonb_build_object(
            'id', v_worst_qual->>'id',
            'draw_type', 'main',
            'position', v_alt_pos,
            'is_alternate', true
          ),
          jsonb_build_object(
            'id', v_worst_main->>'id',
            'draw_type', 'qualifying',
            'position', (v_worst_qual->>'position')::int,
            'is_alternate', false
          )
        );
      else
        v_alt_pos := greatest(v_draw_size, coalesce((
          select max((e->>'position')::int) from jsonb_array_elements(v_alt) e
        ), 0)) + 1;
        loop
          exit when not exists (
            select 1 from jsonb_array_elements(v_alt) e
            where (e->>'position')::int = v_alt_pos
          );
          v_alt_pos := v_alt_pos + 1;
        end loop;
        return jsonb_build_object(
          'draw_type', 'main',
          'position', v_alt_pos,
          'is_alternate', true,
          'bumps', '[]'::jsonb
        );
      end if;
    end if;

    return jsonb_build_object(
      'draw_type', 'main',
      'position', (v_worst_main->>'position')::int,
      'is_alternate', false,
      'bumps', v_bumps
    );
  end if;

  -- New entrant doesn't bump main — try qualifying / alternates
  if jsonb_array_length(v_qual) < v_max_qual then
    select coalesce(min(s), 1) into v_pos
    from generate_series(1, v_qual_size) s
    where not exists (
      select 1 from jsonb_array_elements(v_qual) e
      where (e->>'position')::int = s
    );
    return jsonb_build_object(
      'draw_type', 'qualifying',
      'position', v_pos,
      'is_alternate', false,
      'bumps', '[]'::jsonb
    );
  end if;

  select e into v_worst_qual
  from jsonb_array_elements(v_qual) e
  order by coalesce((e->>'ranking')::int, 2147483647) desc
  limit 1;

  if v_worst_qual is not null
     and v_rank is not null
     and v_rank < coalesce((v_worst_qual->>'ranking')::int, 2147483647) then
    v_alt_pos := greatest(v_draw_size, coalesce((
      select max((e->>'position')::int) from jsonb_array_elements(v_alt) e
    ), 0)) + 1;
    loop
      exit when not exists (
        select 1 from jsonb_array_elements(v_alt) e
        where (e->>'position')::int = v_alt_pos
      );
      v_alt_pos := v_alt_pos + 1;
    end loop;
    return jsonb_build_object(
      'draw_type', 'qualifying',
      'position', (v_worst_qual->>'position')::int,
      'is_alternate', false,
      'bumps', jsonb_build_array(jsonb_build_object(
        'id', v_worst_qual->>'id',
        'draw_type', 'main',
        'position', v_alt_pos,
        'is_alternate', true
      ))
    );
  end if;

  v_alt_pos := greatest(v_draw_size, coalesce((
    select max((e->>'position')::int) from jsonb_array_elements(v_alt) e
  ), 0)) + 1;
  loop
    exit when not exists (
      select 1 from jsonb_array_elements(v_alt) e
      where (e->>'position')::int = v_alt_pos
    );
    v_alt_pos := v_alt_pos + 1;
  end loop;

  return jsonb_build_object(
    'draw_type', 'main',
    'position', v_alt_pos,
    'is_alternate', true,
    'bumps', '[]'::jsonb
  );
end;
$$;

revoke all on function public.compute_self_entry_placement(uuid, int) from public;
grant execute on function public.compute_self_entry_placement(uuid, int) to authenticated;
