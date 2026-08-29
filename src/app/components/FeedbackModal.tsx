"use client";

import React, { useState } from "react";
import { Modal, Form, Radio, Input, Checkbox, Button, message, Space } from "antd";
import { MessageOutlined, BugOutlined, BulbOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { useTranslations, useLocale } from "next-intl";

interface FeedbackModalProps {
  open: boolean;
  onCancel: () => void;
}

export function FeedbackModal({ open, onCancel }: FeedbackModalProps) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const t = useTranslations("feedback");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  // Helper to fallback to English if key translations are missing in other languages
  const getT = (key: string, defaultVal: string) => {
    const val = t(key);
    if (val === key || val === `feedback.${key}`) {
      return defaultVal;
    }
    return val;
  };

  const labels = {
    title: getT("title", "Submit Feedback & Suggestions"),
    type: getT("type", "Feedback Type"),
    typeSuggestion: getT("typeSuggestion", "Suggestion / Feature Request"),
    typeBug: getT("typeBug", "Bug Report"),
    typeInquiry: getT("typeInquiry", "General Inquiry"),
    contact: getT("contact", "Contact Info (Email/Telegram/Discord) (Optional)"),
    contactPlaceholder: getT("contactPlaceholder", "How can we reach you? (e.g., email@example.com)"),
    message: getT("message", "Details / Description"),
    messagePlaceholder: getT("messagePlaceholder", "Please describe your suggestion, issue or idea..."),
    attachLogs: getT("attachLogs", "Attach application settings & error logs (excludes API keys)"),
    submit: getT("submit", "Submit Feedback"),
    submitting: getT("submitting", "Submitting..."),
    success: getT("success", "Thank you! Your feedback has been submitted successfully."),
    error: getT("error", "Failed to submit feedback. Please try again later.")
  };

  const handleSubmit = async (values: {
    type: string;
    contact?: string;
    message: string;
    attachLogs: boolean;
  }) => {
    setSubmitting(true);
    try {
      let debugInfo: Record<string, unknown> | undefined = undefined;

      if (values.attachLogs) {
        // Safe check for window/navigator properties on the client
        const safeWindow = typeof window !== "undefined" ? window : null;
        const safeNavigator = typeof navigator !== "undefined" ? navigator : null;

        // Try reading subtitle translator settings from localStorage if available
        let activeModel = "Unknown";
        let activeService = "Unknown";
        try {
          const settingsStr = localStorage.getItem("subtitle-translator-settings") || localStorage.getItem("settings");
          if (settingsStr) {
            const settings = JSON.parse(settingsStr);
            activeModel = settings.model || settings.translationModel || "Unknown";
            activeService = settings.translationService || settings.service || "Unknown";
          }
        } catch {
          // ignore localStorage parsing errors
        }

        debugInfo = {
          "App Version": "2.3.0",
          "Locale": locale,
          "User Agent": safeNavigator?.userAgent || "Unknown",
          "Screen Size": safeWindow ? `${safeWindow.innerWidth}x${safeWindow.innerHeight}` : "Unknown",
          "Active Service": activeService,
          "Active Model": activeModel,
          "Timestamp": new Date().toISOString(),
        };
      }

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: values.type,
          contact: values.contact,
          message: values.message,
          debugInfo,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Submission failed");
      }

      message.success(labels.success);
      form.resetFields();
      onCancel();
    } catch (err: unknown) {
      console.error(err);
      const errMessage = err instanceof Error ? err.message : labels.error;
      message.error(errMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={
        <Space style={{ color: "var(--ant-color-text-heading)" }}>
          <MessageOutlined style={{ color: "var(--ant-color-primary)" }} />
          <span>{labels.title}</span>
        </Space>
      }
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      width={600}
      styles={{
        mask: {
          backdropFilter: "blur(4px)",
        },
      }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          type: "suggestion",
          attachLogs: true,
        }}
        style={{ marginTop: 20 }}
      >
        <Form.Item
          name="type"
          label={labels.type}
          rules={[{ required: true }]}
        >
          <Radio.Group style={{ width: "100%" }}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Radio value="suggestion">
                <Space>
                  <BulbOutlined style={{ color: "#faad14" }} />
                  <span>{labels.typeSuggestion}</span>
                </Space>
              </Radio>
              <Radio value="bug">
                <Space>
                  <BugOutlined style={{ color: "#ff4d4f" }} />
                  <span>{labels.typeBug}</span>
                </Space>
              </Radio>
              <Radio value="inquiry">
                <Space>
                  <InfoCircleOutlined style={{ color: "#1890ff" }} />
                  <span>{labels.typeInquiry}</span>
                </Space>
              </Radio>
            </Space>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="contact"
          label={labels.contact}
        >
          <Input placeholder={labels.contactPlaceholder} allowClear />
        </Form.Item>

        <Form.Item
          name="message"
          label={labels.message}
          rules={[{ required: true, message: labels.messagePlaceholder }]}
        >
          <Input.TextArea
            rows={5}
            placeholder={labels.messagePlaceholder}
            showCount
            maxLength={1000}
          />
        </Form.Item>

        <Form.Item name="attachLogs" valuePropName="checked">
          <Checkbox>
            <span style={{ fontSize: "13px", color: "var(--ant-color-text-secondary)" }}>
              {labels.attachLogs}
            </span>
          </Checkbox>
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
          <Space>
            <Button onClick={onCancel} disabled={submitting}>
              {tCommon("cancel")}
            </Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {submitting ? labels.submitting : labels.submit}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}
