/**
 * PWA /dashboard 起動時、Auth 待ち前に直近旅行へ飛ばす（二重ナビ回避）。
 * React hydrate 前に動かすためインライン script を使う。
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var p=localStorage.getItem("trip-park:pwaLastGroupPath");if(!p||!/^\\/groups\\/[^/]+\\/?$/.test(p))return;location.replace(p.replace(/\\/$/,""));}catch(e){}})();`,
        }}
      />
      {children}
    </>
  );
}
