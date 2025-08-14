import { Alert, Text, Button, Group, Code } from "@mantine/core";
import { IconAlertTriangle, IconRefresh, IconInfoCircle } from "@tabler/icons-react";
import { useState } from "react";

export interface AaveErrorInfo {
  type: "contract" | "network" | "rpc" | "price" | "user" | "unknown";
  message: string;
  details?: string;
  suggestion?: string;
  retryable: boolean;
  asset?: string;
  chainId?: number;
}

interface AaveErrorHandlerProps {
  error: AaveErrorInfo | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function AaveErrorHandler({ error, onRetry, onDismiss }: AaveErrorHandlerProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (!error) return null;

  const getErrorIcon = () => {
    switch (error.type) {
      case "contract":
        return <IconAlertTriangle size={20} />;
      case "network":
        return <IconAlertTriangle size={20} />;
      case "rpc":
        return <IconAlertTriangle size={20} />;
      case "price":
        return <IconInfoCircle size={20} />;
      case "user":
        return <IconInfoCircle size={20} />;
      default:
        return <IconAlertTriangle size={20} />;
    }
  };

  const getErrorColor = () => {
    switch (error.type) {
      case "contract":
      case "network":
      case "rpc":
        return "red";
      case "price":
      case "user":
        return "orange";
      default:
        return "red";
    }
  };

  const getErrorTitle = () => {
    switch (error.type) {
      case "contract":
        return "Smart Contract Error";
      case "network":
        return "Network Error";
      case "rpc":
        return "RPC Connection Error";
      case "price":
        return "Price Data Unavailable";
      case "user":
        return "User Action Required";
      default:
        return "Error";
    }
  };

  return (
    <Alert
      icon={getErrorIcon()}
      title={getErrorTitle()}
      color={getErrorColor()}
      variant="light"
      withCloseButton={!!onDismiss}
      onClose={onDismiss}
    >
      <Text size="sm" mb="xs">
        {error.message}
      </Text>

      {error.suggestion && (
        <Text size="sm" c="dimmed" mb="xs">
          💡 {error.suggestion}
        </Text>
      )}

      {error.details && (
        <div>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setShowDetails(!showDetails)}
            mb="xs"
          >
            {showDetails ? "Hide" : "Show"} Details
          </Button>
          
          {showDetails && (
            <Code block mb="xs">
              {error.details}
            </Code>
          )}
        </div>
      )}

      <Group gap="xs">
        {error.retryable && onRetry && (
          <Button
            size="xs"
            variant="light"
            leftSection={<IconRefresh size={14} />}
            onClick={onRetry}
          >
            Retry
          </Button>
        )}
        
        {error.asset && (
          <Text size="xs" c="dimmed">
            Asset: {error.asset}
          </Text>
        )}
        
        {error.chainId && (
          <Text size="xs" c="dimmed">
            Network: {error.chainId}
          </Text>
        )}
      </Group>
    </Alert>
  );
}

export function parseAaveError(error: any, context?: { asset?: string; chainId?: number }): AaveErrorInfo {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Contract errors
  if (errorMessage.includes("ContractFunctionExecutionError") || errorMessage.includes("getReserveData") || errorMessage.includes("Position") || errorMessage.includes("out of bounds")) {
    return {
      type: "contract",
      message: "Smart contract call failed",
      details: errorMessage,
      suggestion: "This asset might not be available on this network or the contract ABI might be incorrect. Using fallback data.",
      retryable: false,
      asset: context?.asset,
      chainId: context?.chainId,
    };
  }
  
  // RPC errors
  if (errorMessage.includes("timeout") || errorMessage.includes("network") || errorMessage.includes("fetch")) {
    return {
      type: "rpc",
      message: "Network connection failed",
      details: errorMessage,
      suggestion: "Please check your internet connection and try again.",
      retryable: true,
      asset: context?.asset,
      chainId: context?.chainId,
    };
  }
  
  // Price oracle errors
  if (errorMessage.includes("price") || errorMessage.includes("oracle")) {
    return {
      type: "price",
      message: "Price data unavailable",
      details: errorMessage,
      suggestion: "Using fallback price data. This won't affect your transactions.",
      retryable: true,
      asset: context?.asset,
      chainId: context?.chainId,
    };
  }
  
  // User errors
  if (errorMessage.includes("insufficient") || errorMessage.includes("balance") || errorMessage.includes("wallet")) {
    return {
      type: "user",
      message: "User action required",
      details: errorMessage,
      suggestion: "Please check your wallet balance and ensure you have sufficient funds.",
      retryable: false,
      asset: context?.asset,
      chainId: context?.chainId,
    };
  }
  
  // Default
  return {
    type: "unknown",
    message: "An unexpected error occurred",
    details: errorMessage,
    suggestion: "Please try again or contact support if the problem persists.",
    retryable: true,
    asset: context?.asset,
    chainId: context?.chainId,
  };
}
