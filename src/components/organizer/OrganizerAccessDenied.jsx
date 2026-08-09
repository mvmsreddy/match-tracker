import { Link } from 'react-router-dom';
import { Button } from '@/components/primitives/button';

export default function OrganizerAccessDenied({ message }) {
  return (
    <div className="px-4 lg:px-8 py-12 max-w-lg mx-auto text-center space-y-4">
      <div className="text-4xl">🔒</div>
      <h1 className="font-display font-extrabold text-xl tracking-tight">Not your event</h1>
      <p className="text-sm text-muted-foreground">
        {message || 'This tournament belongs to another organizer. You can only manage events you host.'}
      </p>
      <Link to="/tournaments">
        <Button>Go to My Events</Button>
      </Link>
    </div>
  );
}
