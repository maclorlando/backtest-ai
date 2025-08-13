"use client";
import React, { Component, ErrorInfo, ReactNode } from "react";
import { Card, Text, Button, Group } from "@mantine/core";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card withBorder shadow="sm" padding="lg" className="max-w-md mx-auto mt-8">
          <Group justify="center" mb="md">
            <IconAlertTriangle size={48} color="red" />
          </Group>
          <Text size="lg" fw={600} ta="center" mb="md">
            Something went wrong
          </Text>
          <Text size="sm" c="dimmed" ta="center" mb="lg">
            An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
          </Text>
          <Group justify="center">
            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={this.handleRetry}
              variant="light"
            >
              Try Again
            </Button>
            <Button
              onClick={() => window.location.reload()}
              variant="filled"
            >
              Refresh Page
            </Button>
          </Group>
          {process.env.NODE_ENV === "development" && this.state.error && (
            <details className="mt-4 p-3 bg-gray-100 rounded text-xs">
              <summary className="cursor-pointer font-semibold mb-2">
                Error Details (Development)
              </summary>
              <pre className="whitespace-pre-wrap overflow-auto">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </Card>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
