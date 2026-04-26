import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const arizonaFlare = localFont({
  src: [
    {
      path: "../public/fonts/ABCArizonaFlare-Light-Trial.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/ABCArizonaFlare-Regular-Trial.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-arizona-flare",
  display: "swap",
});

const arizonaSans = localFont({
  src: [
    {
      path: "../public/fonts/ABCArizonaSans-Regular-Trial.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-arizona-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Beforest Live Guide",
  description:
    "A Beforest editorial voice experience powered by direct Gemini Live.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${arizonaFlare.variable} ${arizonaSans.variable}`}>
        {children}
      </body>
    </html>
  );
}
