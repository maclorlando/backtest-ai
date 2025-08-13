"use client";
import React from "react";
import { Card, Text, Progress, Group, Badge, ActionIcon } from "@mantine/core";
import { IconX, IconCheck, IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";

export type StatusType = "info" | "success" | "warning" | "error" | "loading";

interface StatusCardProps {
  type: StatusType;
  title: string;
  message?: string;
  progress?: number;
  details?: string;
  onClose?: () => void;
  showClose?: boolean;
}

const statusConfig = {
  info: {
    color: "blue",
    icon: IconInfoCircle,
  },
  success: {
    color: "green",
    icon: IconCheck,
  },
  warning: {
    color: "orange",
    icon: IconAlertTriangle,
  },
  error: {
    color: "red",
    icon: IconAlertTriangle,
  },
  loading: {
    color: "blue",
    icon: IconInfoCircle,
  },
};

export default function StatusCard({
  type,
  title,
  message,
  progress,
  details,
  onClose,
  showClose = true,
}: StatusCardProps) {
  const config = statusConfig[type];
  const Icon = config.icon;

  return (
    <Card withBorder shadow="sm" padding="md" className="mb-4">
      <Group justify="space-between" align="flex-start">
        <Group gap="sm" align="flex-start">
          <Icon size={20} color={`var(--mantine-color-${config.color}-6)`} />
          <div className="flex-1">
            <Group gap="sm" align="center" mb={message ? "xs" : 0}>
              <Text size="sm" fw={600}>
                {title}
              </Text>
              <Badge color={config.color} variant="light" size="xs">
                {type.toUpperCase()}
              </Badge>
            </Group>
            {message && (
              <Text size="sm" c="dimmed" mb={details ? "xs" : 0}>
                {message}
              </Text>
            )}
            {details && (
              <Text size="xs" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
                {details}
              </Text>
            )}
            {progress !== undefined && (
              <Progress
                value={progress}
                color={config.color}
                size="sm"
                mt="xs"
                children={`${Math.round(progress)}%`}
              />
            )}
          </div>
        </Group>
        {showClose && onClose && (
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={onClose}
            size="sm"
          >
            <IconX size={16} />
          </ActionIcon>
        )}
      </Group>
    </Card>
  );
}
