# Test Credentials

Tennis Tracker Pro uses a **mock localStorage backend** (Supabase not configured). Demo accounts are auto-seeded on first load of `/login`.

## Demo Accounts (Auto-seeded)

| Role         | Email                             | Password    |
|--------------|-----------------------------------|-------------|
| Player       | player@matchtracker.app           | player123   |
| Coach        | coach@matchtracker.app            | coach123    |
| Parent       | parent@matchtracker.app           | parent123   |
| Nutritionist | nutritionist@matchtracker.app     | nutri123    |

## Preview URL
https://0e360100-eae9-4867-811b-c1ce9b3f6a38.preview.emergentagent.com

## Notes
- Credentials work by clicking one of the demo-account rows on `/login` (auto-fills the form) or by typing them manually.
- All app data is stored in `localStorage` — clearing site data resets the app to a fresh seed.
- Player accounts can be created via the signup flow if needed.
