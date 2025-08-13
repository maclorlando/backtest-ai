"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Card, Group, Text, ActionIcon } from "@mantine/core";
import { IconChartLine, IconWallet, IconBuildingBank, IconSettings } from "@tabler/icons-react";

const navItems = [
  {
    href: "/",
    label: "Backtest",
    icon: IconChartLine,
    description: "Portfolio backtesting & analysis"
  },
  {
    href: "/wallet",
    label: "Wallet",
    icon: IconWallet,
    description: "Wallet management & balances"
  },
  {
    href: "/aave",
    label: "Aave",
    icon: IconBuildingBank,
    description: "DeFi lending & borrowing"
  },
  {
    href: "/settings",
    label: "Settings",
    icon: IconSettings,
    description: "Configuration & preferences"
  }
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <Card padding="md" shadow="sm" radius="md" withBorder className="mb-6">
      <Group justify="space-between" align="center">
        <Text size="lg" fw={700}>Backtest AI</Text>
        <Group gap="xs">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                <ActionIcon
                  variant={isActive ? "filled" : "light"}
                  color={isActive ? "blue" : "gray"}
                  size="lg"
                  className="transition-all duration-200 hover:scale-105"
                  title={item.description}
                >
                  <Icon size={20} />
                </ActionIcon>
              </Link>
            );
          })}
        </Group>
      </Group>
    </Card>
  );
}
