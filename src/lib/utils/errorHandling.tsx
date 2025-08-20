import { notifications } from "@mantine/notifications";
import { 
  IconAlertTriangle,
  IconAlertCircle,
  IconCheck,
  IconInfoCircle,
  IconX
} from "@tabler/icons-react";

export interface ErrorDetails {
  code?: string | number;
  message: string;
  details?: string;
  suggestion?: string;
  retryable?: boolean;
}

export function parseBlockchainError(error: any): ErrorDetails {
  // Handle private key validation errors
  if (error?.message?.includes("Invalid private key")) {
    return {
      code: "INVALID_PRIVATE_KEY",
      message: "Invalid private key format",
      details: error.message,
      suggestion: "Make sure your private key is 64 hexadecimal characters. You can include or omit the '0x' prefix.",
      retryable: false
    };
  }

  // Handle Aave data fetching errors
  if (error?.message?.includes("Failed to fetch") || error?.message?.includes("AAVE")) {
    return {
      code: "AAVE_DATA_ERROR",
      message: "Failed to fetch Aave market data",
      details: error.message,
      suggestion: "Please check your internet connection and try again. The data will be refreshed automatically.",
      retryable: true
    };
  }

  // Handle RPC timeout errors
  if (error?.message?.includes("timeout") || error?.message?.includes("RPC")) {
    return {
      code: "RPC_TIMEOUT",
      message: "Network request timed out",
      details: error.message,
      suggestion: "The network is experiencing high load. Please try again in a few moments.",
      retryable: true
    };
  }

  // Handle contract function errors
  if (error?.message?.includes("ContractFunctionExecutionError") || error?.message?.includes("decimals")) {
    return {
      code: "INVALID_CONTRACT",
      message: "Invalid token contract",
      details: error.message,
      suggestion: "This token address may not be a valid ERC20 contract. Please check the address and try again.",
      retryable: false
    };
  }

  // Default error parsing
  return {
    code: error?.code || "UNKNOWN_ERROR",
    message: error?.message || "An unexpected error occurred",
    details: error?.details || error?.stack,
    suggestion: "Please try again. If the problem persists, contact support.",
    retryable: true
  };
}

export function showErrorNotification(error: any, title?: string) {
  const errorDetails = parseBlockchainError(error);
  
  notifications.show({
    id: `error-${Date.now()}`,
    title: title || errorDetails.message,
    message: errorDetails.suggestion || errorDetails.details,
    color: 'red',
    variant: 'error',
    icon: <IconAlertTriangle size={16} />,
    autoClose: 8000,
    withCloseButton: true,
    styles: {
      root: {
        borderLeft: '4px solid #e53e3e',
        backgroundColor: '#1a202c',
        color: '#e2e8f0',
      },
      title: {
        color: '#feb2b2',
        fontWeight: 600,
      },
      description: {
        color: '#cbd5e0',
      },
      closeButton: {
        color: '#a0aec0',
        '&:hover': {
          backgroundColor: '#2d3748',
        },
      },
    },
  });
}

export function showSuccessNotification(message: string, title?: string) {
  notifications.show({
    id: `success-${Date.now()}`,
    title: title || "Success",
    message: message,
    color: 'green',
    variant: 'success',
    icon: <IconCheck size={16} />,
    autoClose: 5000,
    withCloseButton: true,
    styles: {
      root: {
        borderLeft: '4px solid #38a169',
        backgroundColor: '#1a202c',
        color: '#e2e8f0',
      },
      title: {
        color: '#9ae6b4',
        fontWeight: 600,
      },
      description: {
        color: '#cbd5e0',
      },
      closeButton: {
        color: '#a0aec0',
        '&:hover': {
          backgroundColor: '#2d3748',
        },
      },
    },
  });
}

export function showWarningNotification(message: string, title?: string) {
  notifications.show({
    id: `warning-${Date.now()}`,
    title: title || "Warning",
    message: message,
    color: 'yellow',
    variant: 'warning',
    icon: <IconAlertCircle size={16} />,
    autoClose: 6000,
    withCloseButton: true,
    styles: {
      root: {
        borderLeft: '4px solid #d69e2e',
        backgroundColor: '#1a202c',
        color: '#e2e8f0',
      },
      title: {
        color: '#faf089',
        fontWeight: 600,
      },
      description: {
        color: '#cbd5e0',
      },
      closeButton: {
        color: '#a0aec0',
        '&:hover': {
          backgroundColor: '#2d3748',
        },
      },
    },
  });
}

export function showInfoNotification(message: string, title?: string) {
  notifications.show({
    id: `info-${Date.now()}`,
    title: title || "Information",
    message: message,
    color: 'blue',
    variant: 'info',
    icon: <IconInfoCircle size={16} />,
    autoClose: 4000,
    withCloseButton: true,
    styles: {
      root: {
        borderLeft: '4px solid #3182ce',
        backgroundColor: '#1a202c',
        color: '#e2e8f0',
      },
      title: {
        color: '#90cdf4',
        fontWeight: 600,
      },
      description: {
        color: '#cbd5e0',
      },
      closeButton: {
        color: '#a0aec0',
        '&:hover': {
          backgroundColor: '#2d3748',
        },
      },
    },
  });
}

// Retry utility for failed operations
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const errorDetails = parseBlockchainError(error);
      
      if (!errorDetails.retryable || attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
      
      // Show retry notification
      showInfoNotification(
        `Retrying operation (${attempt}/${maxRetries})...`,
        "Retry"
      );
    }
  }
  
  throw lastError;
}
