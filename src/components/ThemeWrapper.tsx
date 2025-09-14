"use client";
import { useEffect, useState } from "react";

export default function ThemeWrapper({ children }: { children: React.ReactNode }) {
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
