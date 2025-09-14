"use client";
import React from "react";
import Link from "next/link";
import { IconChartLine, IconBuildingBank, IconRoad, IconSettings, IconWallet, IconTrendingUp, IconShield, IconUsers, IconCreditCard, IconRocket } from "@tabler/icons-react";
import WalletWidget from "@/components/WalletWidget";

export default function LandingPage() {
  const features = [
    {
      icon: IconChartLine,
      title: "Portfolio Backtesting",
      description: "Test your crypto investment strategies with historical data and advanced analytics",
      href: "/backtest",
      color: "bg-blue-500"
    },
    {
      icon: IconBuildingBank,
      title: "Aave Integration",
      description: "DeFi lending and borrowing with one-click portfolio deployment",
      href: "/aave",
      color: "bg-green-500"
    },
    {
      icon: IconWallet,
      title: "Wallet Management",
      description: "Advanced wallet management with ERC-20 token tracking and balances",
      href: "/wallet",
      color: "bg-purple-500"
    },
    {
      icon: IconRoad,
      title: "Project Roadmap",
      description: "Explore our vision from Aave markets to DeFi-powered neobank",
      href: "/roadmap",
      color: "bg-orange-500"
    }
  ];

  const roadmapHighlights = [
    {
      phase: "Phase 1",
      title: "MVP Launch",
      description: "Aave markets with backtesting and portfolio deployment",
      status: "current"
    },
    {
      phase: "Phase 2",
      title: "Smart Contracts",
      description: "Batch transactions and automated rebalancing",
      status: "upcoming"
    },
    {
      phase: "Phase 3",
      title: "Institutional Vaults",
      description: "ERC-4626 compliant Meta Vaults for funds and DAOs",
      status: "upcoming"
    },
    {
      phase: "Phase 4",
      title: "Multi-Chain",
      description: "Kamino, Cetus, Hyperliquid integrations",
      status: "upcoming"
    },
    {
      phase: "Phase 5",
      title: "DeFi Neobank",
      description: "Credit cards linked to DeFi yield for real-world spending",
      status: "vision"
    }
  ];

  const stats = [
    { label: "Supported Chains", value: "Multi-Chain", icon: IconShield },
    { label: "DeFi Protocols", value: "Aave", icon: IconBuildingBank },
    { label: "Features", value: "4+", icon: IconTrendingUp },
    { label: "Roadmap Phases", value: "5", icon: IconRocket }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="hero text-center py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="hero-title text-5xl md:text-6xl lg:text-7xl font-bold mb-6">
              DeBank
              <span className="block text-2xl md:text-3xl lg:text-4xl font-normal text-[rgb(var(--fg-secondary))] mt-2">
                (DeFi Bank)
              </span>
            </h1>
            <p className="hero-subtitle text-xl md:text-2xl mb-8 max-w-3xl mx-auto">
              From Aave Markets to Multi-Chain Portfolio Management — and Beyond
            </p>
            <p className="text-lg text-[rgb(var(--fg-secondary))] mb-12 max-w-2xl mx-auto">
              A non-custodial platform for testing and managing DeFi portfolios. 
              Start with Aave markets and grow into a comprehensive DeFi ecosystem.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link href="/backtest" className="btn btn-primary btn-lg">
                <IconChartLine size={20} />
                Start Backtesting
              </Link>
              <Link href="/roadmap" className="btn btn-secondary btn-lg">
                <IconRoad size={20} />
                View Roadmap
              </Link>
            </div>

            {/* Wallet Connection */}
            <div className="flex justify-center">
              <WalletWidget />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-[rgb(var(--bg-secondary))]">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} className="text-center">
                  <div className="w-16 h-16 bg-[rgb(var(--accent-primary))] rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon size={24} className="text-white" />
                  </div>
                  <div className="text-3xl font-bold text-[rgb(var(--fg-primary))] mb-2">{stat.value}</div>
                  <div className="text-[rgb(var(--fg-secondary))]">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[rgb(var(--fg-primary))] mb-4">Platform Features</h2>
            <p className="text-xl text-[rgb(var(--fg-secondary))] max-w-2xl mx-auto">
              Everything you need to manage and optimize your DeFi portfolio
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Link key={index} href={feature.href} className="group">
                  <div className="card hover:scale-105 transition-all duration-300 cursor-pointer">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 ${feature.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        <Icon size={24} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-[rgb(var(--fg-primary))] mb-2 group-hover:text-[rgb(var(--accent-primary))] transition-colors">
                          {feature.title}
                        </h3>
                        <p className="text-[rgb(var(--fg-secondary))] leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Roadmap Preview */}
      <section className="py-20 bg-[rgb(var(--bg-secondary))]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[rgb(var(--fg-primary))] mb-4">Development Roadmap</h2>
            <p className="text-xl text-[rgb(var(--fg-secondary))] max-w-2xl mx-auto">
              Our journey from MVP to DeFi-powered neobank
            </p>
          </div>
          
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {roadmapHighlights.map((item, index) => (
                <div key={index} className="text-center">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                    item.status === 'current' ? 'bg-green-500' :
                    item.status === 'upcoming' ? 'bg-blue-500' :
                    'bg-purple-500'
                  }`}>
                    <span className="text-white font-bold text-sm">{item.phase}</span>
                  </div>
                  <h3 className="font-semibold text-[rgb(var(--fg-primary))] mb-2">{item.title}</h3>
                  <p className="text-sm text-[rgb(var(--fg-secondary))] leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
            
            <div className="text-center mt-12">
              <Link href="/roadmap" className="btn btn-primary">
                <IconRoad size={18} />
                View Full Roadmap
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Problem & Solution */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div>
                <h2 className="text-3xl font-bold text-[rgb(var(--fg-primary))] mb-6">The Problem</h2>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-[rgb(var(--fg-secondary))]">Hard to backtest and deploy diversified DeFi strategies</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-[rgb(var(--fg-secondary))]">Multiple transactions required for portfolio management</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-[rgb(var(--fg-secondary))]">Fragmented liquidity across different protocols</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-[rgb(var(--fg-secondary))]">No bridge between DeFi growth and real-world expenses</p>
                  </div>
                </div>
              </div>
              
              <div>
                <h2 className="text-3xl font-bold text-[rgb(var(--fg-primary))] mb-6">Our Solution</h2>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-[rgb(var(--fg-secondary))]">One-click Aave market portfolio deployment</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-[rgb(var(--fg-secondary))]">Advanced backtesting with historical data</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-[rgb(var(--fg-secondary))]">Multi-chain expansion roadmap</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-[rgb(var(--fg-secondary))]">Future DeFi-powered credit integration</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Target Audience */}
      <section className="py-20 bg-[rgb(var(--bg-secondary))]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[rgb(var(--fg-primary))] mb-4">Built For Everyone</h2>
            <p className="text-xl text-[rgb(var(--fg-secondary))] max-w-2xl mx-auto">
              From retail investors to institutions, DeBank serves all DeFi users
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="card text-center">
              <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <IconUsers size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Retail Investors</h3>
              <p className="text-sm text-[rgb(var(--fg-secondary))]">Start with Aave market strategies</p>
            </div>
            
            <div className="card text-center">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <IconTrendingUp size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Advanced Users</h3>
              <p className="text-sm text-[rgb(var(--fg-secondary))]">Access to LP strategies and complex portfolios</p>
            </div>
            
            <div className="card text-center">
              <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <IconBuildingBank size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Institutions</h3>
              <p className="text-sm text-[rgb(var(--fg-secondary))]">ERC-4626 vault wrappers and compliance</p>
            </div>
            
            <div className="card text-center">
              <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <IconCreditCard size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Everyday Users</h3>
              <p className="text-sm text-[rgb(var(--fg-secondary))]">Credit cards linked to DeFi yield (Phase 5)</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-4xl font-bold text-[rgb(var(--fg-primary))] mb-6">Ready to Get Started?</h2>
            <p className="text-xl text-[rgb(var(--fg-secondary))] mb-8">
              Join the future of DeFi portfolio management. Start with our MVP and grow with our roadmap.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/backtest" className="btn btn-primary btn-lg">
                <IconChartLine size={20} />
                Try Portfolio Backtesting
              </Link>
              <Link href="/aave" className="btn btn-secondary btn-lg">
                <IconBuildingBank size={20} />
                Explore Aave Integration
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
