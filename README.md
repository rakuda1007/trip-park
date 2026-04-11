This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

**TripPark（本リポジトリ）**は Git で管理し、GitHub 上の**テニスパークとは別のリポジトリ**に push できます。手順は [docs/GITHUB.md](./docs/GITHUB.md) を参照してください。

## Getting Started

1. Copy `.env.local.example` to `.env.local` and set your Firebase web app config (`NEXT_PUBLIC_FIREBASE_*`).

2. In the Firebase console, enable **Authentication → Sign-in method → Email/Password**, and create a **Firestore** database.

3. Deploy the rules in `firestore.rules` (or paste them in Firestore → Rules) so users can read/write their own `users/{uid}` document.

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to optimize and load [Geist](https://vercel.com/font).

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Firebase Documentation](https://firebase.google.com/docs) — Authentication, Firestore, Cloud Functions, etc.
- [Add Firebase to your JavaScript project](https://firebase.google.com/docs/web/setup)

## Deploy (Firebase Hosting など)

[Firebase Hosting](https://firebase.google.com/docs/hosting) や [Web Frameworks の統合](https://firebase.google.com/docs/hosting/frameworks/nextjs) を利用してデプロイできます。環境変数は Firebase / ホスティング側の設定に合わせてください。
