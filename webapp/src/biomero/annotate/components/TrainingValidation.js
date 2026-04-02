import React from "react";
import { Callout, Intent, Icon, Spinner } from "@blueprintjs/core";

/**
 * Displays training readiness validation results as a checklist.
 *
 * Props:
 *   validation: { ready, checks: [{check, level, message}], summary } | null
 *   loading: bool
 */
const TrainingValidation = ({ validation, loading = false }) => {
  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <Spinner size={30} />
        <p style={{ marginTop: 8, color: "#888" }}>
          Checking annotation readiness...
        </p>
      </div>
    );
  }

  if (!validation) {
    return null;
  }

  const levelConfig = {
    blocker: {
      icon: "cross",
      intent: Intent.DANGER,
      color: "#db3737",
      bg: "rgba(219, 55, 55, 0.08)",
      border: "rgba(219, 55, 55, 0.3)",
    },
    warning: {
      icon: "warning-sign",
      intent: Intent.WARNING,
      color: "#bf7326",
      bg: "rgba(191, 115, 38, 0.08)",
      border: "rgba(191, 115, 38, 0.3)",
    },
    pass: {
      icon: "tick-circle",
      intent: Intent.SUCCESS,
      color: "#0d8050",
      bg: "rgba(13, 128, 80, 0.08)",
      border: "rgba(13, 128, 80, 0.3)",
    },
  };

  const { summary } = validation;

  return (
    <div>
      {/* Summary counts */}
      {summary && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 16,
            padding: 12,
            background: "#f5f5f5",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          <div>
            <strong>Training:</strong> {summary.train_done}/{summary.train_total}
          </div>
          <div>
            <strong>Validation:</strong> {summary.val_done}/{summary.val_total}
          </div>
          {summary.test_total > 0 && (
            <div>
              <strong>Test:</strong> {summary.test_done}/{summary.test_total}
            </div>
          )}
        </div>
      )}

      {/* Validation checks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {validation.checks.map((check, i) => {
          const cfg = levelConfig[check.level] || levelConfig.pass;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 14px",
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                borderRadius: 6,
              }}
            >
              <Icon
                icon={cfg.icon}
                intent={cfg.intent}
                style={{ marginTop: 2 }}
              />
              <span style={{ fontSize: 13 }}>{check.message}</span>
            </div>
          );
        })}
      </div>

      {/* Overall status */}
      {!validation.ready && (
        <Callout intent={Intent.DANGER} style={{ marginTop: 12 }} icon="error">
          Fix the issues marked above before starting training.
        </Callout>
      )}
    </div>
  );
};

export default TrainingValidation;
