# TimeTrack — Deployment Guide
**For: Alger Valenciano | No coding experience needed**

---

## Overview — What You're About to Do

You'll set up 3 free accounts and connect them in order:

```
FIREBASE (Google)   →   GITHUB (code storage)   →   VERCEL (website host)
  [your database]         [holds your files]          [the live URL]
```

Total time: about 30–45 minutes.

---

## PART 1 — Set Up Firebase (your database)

Firebase is Google's free cloud database. This is where all clock-ins, entries, and employee data will live — on Google's servers, 24/7.

### Step 1.1 — Create a Firebase account

1. Go to **https://firebase.google.com**
2. Click **"Get started"** (top right)
3. Sign in with any Google account (Gmail works fine)

---

### Step 1.2 — Create your project

1. Click **"Add project"**
2. Project name: type `timetrack-vas` → click **Continue**
3. "Enable Google Analytics" screen → **uncheck it** → click **Continue**
4. Wait about 30 seconds → click **"Continue"**
5. You're now inside your Firebase project dashboard

---

### Step 1.3 — Create the database (Firestore)

1. In the left sidebar, click **"Build"** → **"Firestore Database"**
2. Click **"Create database"**
3. A popup appears:
   - Select **"Start in test mode"** → click **Next**
   - Location: choose **`us-west1 (Oregon)`** (closest to California) → click **Enable**
4. Wait about 30 seconds for it to create
5. You'll see an empty database screen — that's correct

---

### Step 1.4 — Get your Firebase config (the important part)

1. Click the **gear icon ⚙️** (top left, next to "Project Overview")
2. Click **"Project settings"**
3. Scroll down to the **"Your apps"** section
4. Click the **`</>`** icon (Web app button)
5. App nickname: type `timetrack` → click **"Register app"**
6. You'll see a block of code like this — **leave this tab open**, you'll need it shortly:

```
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "timetrack-vas.firebaseapp.com",
  projectId: "timetrack-vas",
  storageBucket: "timetrack-vas.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

7. Click **"Continue to console"**

---

## PART 2 — Upload Your Files to GitHub

GitHub is where your app's code lives online. Vercel (in Part 3) will read from here.

### Step 2.1 — Create a GitHub account

1. Go to **https://github.com**
2. Click **"Sign up"**
3. Create a free account (use any email)
4. Verify your email

---

### Step 2.2 — Unzip the project

1. Find the file **`timetrack.zip`** you downloaded
2. **Unzip it** (on Windows: right-click → Extract All | on Mac: double-click)
3. You'll have a folder called `timetrack` with these files inside:
   ```
   timetrack/
   ├── package.json
   ├── vite.config.js
   ├── index.html
   ├── .gitignore
   └── src/
       ├── main.jsx
       ├── firebase.js   ← YOU WILL EDIT THIS ONE
       └── App.jsx
   ```

---

### Step 2.3 — Add your Firebase config to the code

1. Open the `timetrack/src/firebase.js` file in any text editor
   - Windows: right-click → Open with → Notepad
   - Mac: right-click → Open with → TextEdit
2. You'll see this at the top:
   ```js
   const firebaseConfig = {
     apiKey: "PASTE_YOUR_API_KEY_HERE",
     authDomain: "PASTE_YOUR_AUTH_DOMAIN_HERE",
     projectId: "PASTE_YOUR_PROJECT_ID_HERE",
     ...
   };
   ```
3. Replace each `"PASTE_YOUR_..._HERE"` with the matching value from the Firebase config you left open in Step 1.4
4. **Save the file**

Example of what it looks like when done:
```js
const firebaseConfig = {
  apiKey: "AIzaSyD8...",
  authDomain: "timetrack-vas.firebaseapp.com",
  projectId: "timetrack-vas",
  storageBucket: "timetrack-vas.appspot.com",
  messagingSenderId: "987654321",
  appId: "1:987654321:web:xyz789"
};
```

---

### Step 2.4 — Create a GitHub repository

1. Go back to **https://github.com** (sign in if needed)
2. Click the **"+"** button (top right) → **"New repository"**
3. Repository name: `timetrack-vas`
4. Make sure it's set to **Public**
5. **Do NOT** check any of the "Initialize" boxes
6. Click **"Create repository"**
7. You'll see an empty repo page — leave it open

---

### Step 2.5 — Upload your files

1. On your empty GitHub repo page, click **"uploading an existing file"** (the link in the middle of the page)
2. Open your file manager / Finder and navigate to the `timetrack` folder you unzipped
3. Select **all files and folders inside** the `timetrack` folder (Ctrl+A on Windows, Cmd+A on Mac)
4. Drag them into the GitHub upload area in your browser
5. Wait for all files to upload (you'll see a list appear)
6. Scroll down, leave the commit message as is, click **"Commit changes"**
7. Wait about 10 seconds — your code is now on GitHub ✓

---

## PART 3 — Deploy on Vercel (your live website)

Vercel reads your GitHub code and turns it into a live website.

### Step 3.1 — Create a Vercel account

1. Go to **https://vercel.com**
2. Click **"Sign Up"**
3. Choose **"Continue with GitHub"** (this connects your accounts automatically)
4. Authorize Vercel to access your GitHub

---

### Step 3.2 — Import your project

1. Once logged in, click **"Add New…"** → **"Project"**
2. You'll see your GitHub repos listed — find **`timetrack-vas`**
3. Click **"Import"**

---

### Step 3.3 — Deploy

1. Vercel will auto-detect it's a Vite project — don't change anything
2. Just click the big **"Deploy"** button
3. Wait about 2 minutes while Vercel builds your site
4. 🎉 When done, you'll see **"Congratulations!"** and a URL like:
   ```
   https://timetrack-vas.vercel.app
   ```
5. Click **"Continue to Dashboard"**
6. Click the URL to open your live app

---

## PART 4 — Test It

1. Open the URL
2. Click **"Admin Panel"** → enter password: **`timetracker`**
3. Go to **Manage Employees** → add your 3 test names (Marjorie, Jamehla, yourself)
4. Go back to the home screen
5. Click **"I'm an Employee"** → select a name → **Clock In**
6. Open the admin panel on another tab — you should see the person in **"Active Right Now"** updating live ✓

---

## PART 5 — Share With Your VAs

Once tested, send your VAs this message:

---
> **TimeTrack is live!**
>
> Here's the link: `https://timetrack-vas.vercel.app` (replace with your actual URL)
>
> How to use it:
> 1. Open the link on your phone or laptop
> 2. Tap **"I'm an Employee"**
> 3. Select your name
> 4. Tap **Clock In** when you start working
> 5. Tap **Take Break** during breaks
> 6. Tap **Resume** when break ends
> 7. Tap **Clock Out** when your shift is done
>
> All times are in **California time (PST/PDT)**.
> Do not use the Admin Panel — that's for management only.
---

---

## PART 6 — Adding and Removing Employees (anytime)

You can add or remove employees at any time without touching any code:

1. Open the app URL
2. Click **Admin Panel** → enter `timetracker`
3. Scroll to **"Manage Employees"**
4. **Add**: type their full name → click **Add**
5. **Remove**: click the ✕ button next to their name → confirm

When you remove an employee:
- They disappear from the name picker
- Their past time entries **stay in the records** (you won't lose history)

---

## PART 7 — Keeping Firebase Free

Your Firebase free tier allows:
- **50,000 database reads per day**
- **20,000 writes per day**

At 40 VAs, your actual usage will be around **~10,000 reads/day** — well within the free limit. You'll never be charged.

Firebase will automatically email you if usage ever gets close to limits (it won't).

---

## PART 8 — Changing the Admin Password

1. Go to **https://github.com** → your `timetrack-vas` repo
2. Click on `src/` → `App.jsx`
3. Click the pencil ✏️ icon (Edit this file)
4. Find this line near the top:
   ```js
   const ADMIN_PASSWORD = "timetracker";
   ```
5. Change `timetracker` to your new password
6. Scroll down → click **"Commit changes"**
7. Vercel automatically rebuilds and deploys within ~2 minutes
8. New password is now live

---

## PART 9 — Adding More Employees (after initial setup)

Just use the Admin Panel → Manage Employees → Add. No code changes needed.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Loading…" spinner won't stop | Firebase config in `firebase.js` is wrong. Re-check Step 2.3 |
| App loads but data doesn't save | Firestore wasn't created in "Test mode". Go to Firebase Console → Firestore → Rules → paste `allow read, write: if true;` and publish |
| "Permission denied" error | Same as above — Firestore rules issue |
| App shows but looks broken | Hard refresh the page (Ctrl+Shift+R on Windows, Cmd+Shift+R on Mac) |
| Vercel build failed | Go to Vercel dashboard → your project → "Deployments" → click the failed deployment → read the error log |
| Can't find my URL | Go to vercel.com → dashboard → click your `timetrack-vas` project → the URL is at the top |

---

## Quick Reference

| Item | Value |
|---|---|
| App URL | Your Vercel URL (you'll get it in Step 3.3) |
| Admin Password | `timetracker` |
| Firebase Console | https://console.firebase.google.com |
| GitHub Repo | https://github.com/YOUR_USERNAME/timetrack-vas |
| Vercel Dashboard | https://vercel.com/dashboard |

---

*Made for Alger Valenciano's VA team. All times in PST/PDT (Los Angeles, California).*
