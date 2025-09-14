"use client";
import React, { useEffect } from "react";
import { IconX, IconCheck, IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";

interface NotificationProps {
  id: string;
  title: string;
  message: string;
  type: "success" | "error" | "warning" | "info";
  onClose: (id: string) => void;
  duration?: number;
}

export default function Notification({ 
  id, 
  title, 
  message, 
  type, 
  onClose, 
  duration = 5000 
}: NotificationProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case "success":
        return <IconCheck size={16} />;
      case "error":
        return <IconX size={16} />;
      case "warning":
        return <IconAlertTriangle size={16} />;
      case "info":
        return <IconInfoCircle size={16} />;
      default:
        return <IconInfoCircle size={16} />;
    }
  };

  const getStyles = () => {
    switch (type) {
      case "success":
        return "bg-green-900 border-green-700 text-green-100";
      case "error":
        return "bg-red-900 border-red-700 text-red-100";
      case "warning":
        return "bg-yellow-900 border-yellow-700 text-yellow-100";
      case "info":
        return "bg-blue-900 border-blue-700 text-blue-100";
      default:
        return "bg-blue-900 border-blue-700 text-blue-100";
    }
  };

  return (
    <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg border max-w-sm ${getStyles()} animate-in slide-in-from-right-2`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{title}</div>
          <div className="text-sm opacity-90">{message}</div>
        </div>
        <button
          onClick={() => onClose(id)}
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
        >
          <IconX size={16} />
        </button>
      </div>
    </div>
  );
}

// Notification manager hook
export function useNotifications() {
  const [notifications, setNotifications] = React.useState<Array<{
    id: string;
    title: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>>([]);

  const showNotification = (
    title: string, 
    message: string, 
    type: "success" | "error" | "warning" | "info" = "info"
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, title, message, type }]);
  };

  const closeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return {
    notifications,
    showNotification,
    closeNotification,
  };
}
