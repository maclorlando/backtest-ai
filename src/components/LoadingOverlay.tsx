"use client";
import React from "react";
import { Overlay, Loader, Text, Group } from "@mantine/core";

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  zIndex?: number;
}

export default function LoadingOverlay({ 
  visible, 
  message = "Loading...", 
  zIndex = 1000 
}: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <Overlay
      backgroundOpacity={0.35}
      blur={3}
      zIndex={zIndex}
      className="flex items-center justify-center"
    >
      <Group gap="md">
        <Loader size="lg" />
        <Text size="lg" fw={500}>
          {message}
        </Text>
      </Group>
    </Overlay>
  );
}
