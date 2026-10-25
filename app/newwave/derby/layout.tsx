import localFont from "next/font/local";

const oswald = localFont({ src: "../../fonts/oswald.woff2", weight: "500 700", variable: "--font-club" });

export default function DerbyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`${oswald.variable} flex flex-1 flex-col bg-white`}>{children}</div>;
}
