"use client";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AppProvider } from "@/lib/context/AppContext";
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

// Create a custom theme for Mantine with proper notification styling
const theme = createTheme({
	primaryColor: 'blue',
	colors: {
		// Custom colors for notifications
		red: ['#fff5f5', '#fed7d7', '#feb2b2', '#fc8181', '#f56565', '#e53e3e', '#c53030', '#9b2c2c', '#742a2a', '#742a2a'],
		green: ['#f0fff4', '#c6f6d5', '#9ae6b4', '#68d391', '#48bb78', '#38a169', '#2f855a', '#276749', '#22543d', '#22543d'],
		yellow: ['#fffff0', '#fefcbf', '#faf089', '#f6e05e', '#ecc94b', '#d69e2e', '#b7791f', '#975a16', '#744210', '#744210'],
		blue: ['#ebf8ff', '#bee3f8', '#90cdf4', '#63b3ed', '#4299e1', '#3182ce', '#2b6cb0', '#2c5282', '#2a4365', '#2a4365'],
	},
	components: {
		Notification: {
			defaultProps: {
				size: 'sm',
			},
			styles: {
				root: {
					borderRadius: '8px',
					boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
					border: '1px solid',
					maxWidth: '320px',
					minWidth: '280px',
					fontSize: '14px',
					position: 'fixed',
					zIndex: 9999,
				},
				title: {
					fontSize: '14px',
					fontWeight: 600,
					lineHeight: 1.4,
				},
				description: {
					fontSize: '13px',
					lineHeight: 1.4,
				},
				icon: {
					width: '16px',
					height: '16px',
				},
				closeButton: {
					width: '20px',
					height: '20px',
				},
			},
		},
	},
});

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark">
			<head>
				<title>Backtest AI</title>
				<meta name="description" content="Advanced crypto portfolio backtesting and analysis" />
				<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
				<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
			</head>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<MantineProvider theme={theme}>
					<Notifications 
						position="top-left" 
						zIndex={9999} 
						containerWidth={320}
						limit={3}
						autoClose={5000}
					/>
					<ThemeWrapper>
						<AppProvider>
							<ErrorBoundary>
								<div className="min-h-screen bg-[rgb(var(--bg-primary))]">
									<Navigation />
									<main className="container mx-auto px-2 sm:px-4 py-3 sm:py-6 max-w-7xl">
										{children}
									</main>
								</div>
							</ErrorBoundary>
						</AppProvider>
					</ThemeWrapper>
				</MantineProvider>
			</body>
		</html>
	);
}

function ThemeWrapper({ children }: { children: React.ReactNode }) {
	const [theme, setTheme] = useState<string | null>(null);
	
	useEffect(() => {
		const t = (typeof window !== "undefined" && window.sessionStorage.getItem("bt_theme")) || "dark";
		setTheme(t);
		document.documentElement.classList.toggle("dark", t !== "light");
		
		const handler = (e: StorageEvent) => {
			if (e.key === "bt_theme" && e.newValue) {
				document.documentElement.classList.toggle("dark", e.newValue !== "light");
			}
		};
		
		window.addEventListener("storage", handler);
		return () => window.removeEventListener("storage", handler);
	}, []);
	
	return <>{children}</>;
}
