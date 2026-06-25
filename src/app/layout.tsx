import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sistema de Titulación — ISAP',
  description: 'Plataforma de gestión de exámenes de grado del Instituto Sonorense de Administración Pública',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
