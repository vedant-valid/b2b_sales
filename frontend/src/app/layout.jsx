import "./globals.css";
import Providers from "@/components/Providers";

export const metadata = { title: "Outreach App" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
