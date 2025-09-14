"use client";
import React from "react";
import Link from "next/link";
import { IconRocket, IconTarget, IconBuildingBank, IconCreditCard, IconTrendingUp, IconShield, IconUsers, IconCode, IconChartLine } from "@tabler/icons-react";

export default function RoadmapPage() {
  const phases = [
    {
      id: 1,
      title: "MVP Launch",
      subtitle: "Aave Base Markets Foundation",
      status: "current",
      icon: IconRocket,
      description: "Launch with Aave Base markets only",
      features: [
        "Backtesting + forward-testing tools",
        "Users connect wallet, sign each transaction manually",
        "One-click Aave Base market portfolio deployment",
        "Portfolio analytics and performance tracking"
      ],
      timeline: "Current Focus"
    },
    {
      id: 2,
      title: "Smart Contract Orchestration",
      subtitle: "Batch Transactions & Automation",
      status: "upcoming",
      icon: IconCode,
      description: "Batch deposits/withdrawals into Aave (one signature)",
      features: [
        "Automated portfolio rebalancing",
        "Expand to other Aave markets beyond base",
        "ERC-4337 account abstraction integration",
        "Smart contract batching for gas optimization"
      ],
      timeline: "Phase 2"
    },
    {
      id: 3,
      title: "Institutional Vaults",
      subtitle: "ERC-4626 Compliance",
      status: "upcoming",
      icon: IconBuildingBank,
      description: "ERC-4626 compliant Meta Vaults on Aave",
      features: [
        "Tokenized vault shares for liquidity",
        "Reporting for funds and DAOs",
        "Institutional-grade compliance",
        "White-label vault infrastructure"
      ],
      timeline: "Phase 3"
    },
    {
      id: 4,
      title: "Multi-Chain Expansion",
      subtitle: "Beyond Aave Ecosystem",
      status: "upcoming",
      icon: IconTrendingUp,
      description: "Kamino (Solana), Cetus (Sui), Hyperliquid integration",
      features: [
        "Kamino auto-compounding vaults",
        "Cetus concentrated liquidity",
        "Hyperliquid perps + liquidity pool strategies",
        "Stable pair LPs (cbBTC/WBTC, JupSOL/SOL)",
        "Unified multi-chain strategy dashboard"
      ],
      timeline: "Phase 4"
    },
    {
      id: 5,
      title: "Real-World Credit Integration",
      subtitle: "DeFi-Powered Neobank",
      status: "vision",
      icon: IconCreditCard,
      description: "DeBank Credit Card issued to KYCed users",
      features: [
        "Users spend in native fiat → monthly bill in USDC",
        "Settlement via USDC holdings or DeFi borrowing",
        "DeFi portfolio growth ≥ user's monthly lifestyle expenses",
        "First step towards a DeFi-powered neobank"
      ],
      timeline: "Phase 5"
    }
  ];

  const problems = [
    {
      title: "Retail Friction",
      description: "Hard to backtest and deploy diversified strategies",
      icon: IconUsers
    },
    {
      title: "Execution Friction", 
      description: "Multiple transactions required on Aave",
      icon: IconCode
    },
    {
      title: "Institutional Barriers",
      description: "Lack of ERC-4626 vaults and compliance-ready wrappers",
      icon: IconBuildingBank
    },
    {
      title: "Fragmented Liquidity",
      description: "Yield opportunities scattered across Aave, Solana, Sui, Hyperliquid, etc.",
      icon: IconChartLine
    },
    {
      title: "Real-World Disconnect",
      description: "No bridge between DeFi portfolio growth and everyday expenses",
      icon: IconCreditCard
    }
  ];

  const advantages = [
    "Clear entry point: Start small with Aave base → scale outward",
    "Full lifecycle coverage: Analytics + execution + vaults + real-world payments",
    "Non-custodial: Assets remain in the user's wallet",
    "Standards-based: ERC-4337 + ERC-4626 compliance",
    "Roadmap to multi-chain + lifestyle integration: Future-proof expansion"
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "current": return "bg-green-500";
      case "upcoming": return "bg-blue-500";
      case "vision": return "bg-purple-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "current": return "Current";
      case "upcoming": return "Upcoming";
      case "vision": return "Vision";
      default: return "Unknown";
    }
  };

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="hero text-center">
        <h1 className="hero-title">DeBank Roadmap</h1>
        <p className="hero-subtitle max-w-3xl mx-auto">
          From Aave Base Markets to Multi-Chain Portfolio Management — and Beyond
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <div className="badge badge-primary">Non-Custodial</div>
          <div className="badge badge-primary">Standards-Based</div>
          <div className="badge badge-primary">Multi-Chain Ready</div>
        </div>
      </section>

      {/* Project Overview */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-[rgb(var(--fg-primary))] text-center">Project Overview</h2>
        <div className="card max-w-4xl mx-auto">
          <p className="text-lg text-[rgb(var(--fg-secondary))] leading-relaxed">
            DeBank is a non-custodial platform for testing and managing DeFi portfolios. 
            Our MVP focuses on Aave Base markets with a roadmap to 
            expand across multiple chains and eventually integrate real-world credit.
          </p>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-3">Current MVP</h3>
              <ul className="space-y-2 text-[rgb(var(--fg-secondary))]">
                <li>• Aave Base markets only</li>
                <li>• Backtesting + forward-testing tools</li>
                <li>• Portfolio analytics and performance tracking</li>
                <li>• Non-custodial wallet integration</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-3">Future Vision</h3>
              <ul className="space-y-2 text-[rgb(var(--fg-secondary))]">
                <li>• Multi-chain ecosystems (Hyperliquid, Kamino, Cetus)</li>
                <li>• Real-world credit integration</li>
                <li>• DeFi-powered neobank</li>
                <li>• Institutional-grade compliance</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Problems We Solve */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-[rgb(var(--fg-primary))] text-center">Problems We Solve</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {problems.map((problem, index) => {
            const Icon = problem.icon;
            return (
              <div key={index} className="card">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-[rgb(var(--accent-primary))] rounded-lg flex items-center justify-center">
                    <Icon size={20} className="text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">{problem.title}</h3>
                </div>
                <p className="text-[rgb(var(--fg-secondary))]">{problem.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Competitive Advantage */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-[rgb(var(--fg-primary))] text-center">Competitive Advantage</h2>
        <div className="card max-w-4xl mx-auto">
          <ul className="space-y-3">
            {advantages.map((advantage, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[rgb(var(--accent-primary))] rounded-full mt-2 flex-shrink-0"></div>
                <span className="text-[rgb(var(--fg-secondary))]">{advantage}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Roadmap Phases */}
      <section className="space-y-8">
        <h2 className="text-3xl font-bold text-[rgb(var(--fg-primary))] text-center">Development Roadmap</h2>
        <div className="space-y-8">
          {phases.map((phase, index) => {
            const Icon = phase.icon;
            return (
              <div key={phase.id} className="relative">
                {/* Connection Line */}
                {index < phases.length - 1 && (
                  <div className="absolute left-8 top-16 w-0.5 h-8 bg-[rgb(var(--border-primary))]"></div>
                )}
                
                <div className="card">
                  <div className="flex items-start gap-6">
                    {/* Phase Icon */}
                    <div className="flex-shrink-0">
                      <div className={`w-16 h-16 ${getStatusColor(phase.status)} rounded-xl flex items-center justify-center`}>
                        <Icon size={28} className="text-white" />
                      </div>
                      <div className={`mt-2 text-xs font-semibold text-center px-2 py-1 rounded-full ${getStatusColor(phase.status)} text-white`}>
                        {getStatusText(phase.status)}
                      </div>
                    </div>

                    {/* Phase Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-bold text-[rgb(var(--fg-primary))]">{phase.title}</h3>
                        <span className="badge badge-secondary">{phase.timeline}</span>
                      </div>
                      <h4 className="text-lg font-semibold text-[rgb(var(--accent-primary))] mb-3">{phase.subtitle}</h4>
                      <p className="text-[rgb(var(--fg-secondary))] mb-4">{phase.description}</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {phase.features.map((feature, featureIndex) => (
                          <div key={featureIndex} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 bg-[rgb(var(--accent-primary))] rounded-full mt-2 flex-shrink-0"></div>
                            <span className="text-sm text-[rgb(var(--fg-secondary))]">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Technology Stack */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-[rgb(var(--fg-primary))] text-center">Technology Stack</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Frontend & Analytics</h3>
            <ul className="space-y-2 text-[rgb(var(--fg-secondary))]">
              <li>• Next.js, React, WalletConnect/RainbowKit</li>
              <li>• CoinGecko APIs for pricing data</li>
              <li>• Custom back/forward testing engine</li>
              <li>• Real-time portfolio analytics</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Smart Contracts & Integrations</h3>
            <ul className="space-y-2 text-[rgb(var(--fg-secondary))]">
              <li>• Aave Base market interactions (MVP)</li>
              <li>• ERC-4337 account abstraction (Phase 2)</li>
              <li>• ERC-4626 vault compliance (Phase 3)</li>
              <li>• Multi-chain integrations (Phase 4)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Target Audience */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-[rgb(var(--fg-primary))] text-center">Target Audience</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card text-center">
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center mx-auto mb-3">
              <IconUsers size={24} className="text-white" />
            </div>
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Retail Investors</h3>
            <p className="text-sm text-[rgb(var(--fg-secondary))]">Start with Aave Base market strategies</p>
          </div>
          <div className="card text-center">
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center mx-auto mb-3">
              <IconTrendingUp size={24} className="text-white" />
            </div>
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Advanced Users</h3>
            <p className="text-sm text-[rgb(var(--fg-secondary))]">Access to LP strategies (cbBTC/WBTC, JupSOL/SOL)</p>
          </div>
          <div className="card text-center">
            <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center mx-auto mb-3">
              <IconBuildingBank size={24} className="text-white" />
            </div>
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Institutions</h3>
            <p className="text-sm text-[rgb(var(--fg-secondary))]">ERC-4626 vault wrappers & reporting</p>
          </div>
          <div className="card text-center">
            <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center mx-auto mb-3">
              <IconCreditCard size={24} className="text-white" />
            </div>
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Everyday Users</h3>
            <p className="text-sm text-[rgb(var(--fg-secondary))]">Credit cards linked to DeFi yield (Phase 5)</p>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-[rgb(var(--fg-primary))] text-center">Get Involved</h2>
        <div className="card max-w-4xl mx-auto text-center">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Retail Users</h3>
              <p className="text-sm text-[rgb(var(--fg-secondary))] mb-4">Test the MVP with Aave Base markets</p>
              <Link href="/" className="btn btn-primary">Try MVP</Link>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Institutions</h3>
              <p className="text-sm text-[rgb(var(--fg-secondary))] mb-4">Partner on ERC-4626 vault pilots</p>
              <a href="/aave" className="btn btn-secondary">Explore Aave</a>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Developers</h3>
              <p className="text-sm text-[rgb(var(--fg-secondary))] mb-4">Join us to expand integrations</p>
              <a href="https://github.com" className="btn btn-outline">View Code</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
