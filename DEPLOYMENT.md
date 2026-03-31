# GigTrap Deployment

## Fast classroom setup on the same Wi-Fi

Run the backend:

```sh
cd backend
npm install
npm start
```

Run the frontend:

```sh
cd frontend
npm install
npm run dev
```

Then open `http://YOUR_COMPUTER_IP:5173` on phones and laptops on the same network.

Notes:

- The frontend dev server is already configured with `--host`.
- In dev mode the client now auto-connects sockets to `http://<same-hostname>:3001`, so phones on the same Wi-Fi should reach the backend without extra env vars.
- If your firewall prompts for access, allow incoming connections for Node.

## Single-service production deploy

Build the frontend:

```sh
npm install
npm run build
npm start
```

The backend now serves `../frontend/dist` automatically when that folder exists, so one process can serve both the app and Socket.IO.

## Railway

Railway can now deploy this repo as a single service from the project root.

Recommended settings:

- Root directory: repository root
- Build command: `npm run build`
- Start command: `npm start`

Why this works:

- Root `postinstall` installs both `backend` and `frontend`
- Root `build` builds the frontend
- Root `start` starts the backend
- The backend serves the built frontend and Socket.IO from one origin

After Railway gives you a public URL, the host dashboard QR code will point students to:

```text
https://your-app.up.railway.app/join?code=ABCDE
```

That means students do not need to be on the same Wi-Fi.

## Suggested hosting targets

- Render Web Service
- Fly.io
- Railway

For those hosts:

- Build the frontend first.
- Deploy the repo with the backend service starting via `npm start` inside `backend`.
- Set `PORT` from the platform.
- Optionally set `CORS_ORIGIN` if you split frontend and backend across different domains.

## Health check

Use:

```sh
/health
```

The backend responds with:

```json
{ "ok": true }
```
