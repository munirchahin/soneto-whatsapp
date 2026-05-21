import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-raleway",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Soneto Pós-venda",
  description: "Painel de atendimento pós-venda Soneto Móveis e Colchões",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${raleway.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden font-[family-name:var(--font-raleway)]">
        {children}
      </body>
    </html>
  );
}
