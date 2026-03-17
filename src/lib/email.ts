// ---------------------------------------------------------------------------
// Email transport via Resend.
// Sends when RESEND_API_KEY is configured. Silently skips when missing,
// allowing the app to run without email in development.
// ---------------------------------------------------------------------------

import { Resend } from "resend";
import { env } from "./env";
import { logger } from "./logger";

let resendClient: Resend | null = null;

function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (resendClient) return resendClient;
  resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email via Resend. No-ops gracefully when API key is not set.
 * Never throws — logs errors and returns false on failure.
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const client = getClient();
  if (!client) {
    logger.debug("Email skipped (RESEND_API_KEY not set)", {
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
    });
    return false;
  }

  try {
    const { error } = await client.emails.send({
      from: env.EMAIL_FROM,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      ...(options.text ? { text: options.text } : {}),
    });

    if (error) {
      logger.error("Resend API error", error, {
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
        subject: options.subject,
      });
      return false;
    }

    logger.info("Email sent", {
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
    });
    return true;
  } catch (error) {
    logger.error("Failed to send email", error, {
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
    });
    return false;
  }
}

/**
 * Verify Resend connection is working. Useful for health checks.
 */
export async function verifyEmailConnection(): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    // Resend doesn't have a verify endpoint, so check API key validity
    await client.apiKeys.list();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailWrapper(content: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 24px 32px; border-bottom: 1px solid #1e293b;">
        <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #f8fafc;">WorkFlow<span style="color: #3b82f6;">Pro</span></h1>
      </div>
      <div style="padding: 32px; color: #cbd5e1;">
        ${content}
      </div>
      <div style="padding: 16px 32px; background: #0c1220; text-align: center; font-size: 12px; color: #475569;">
        &copy; ${new Date().getFullYear()} WorkFlowPro. All rights reserved.
      </div>
    </div>
  `;
}

function actionButton(label: string, url: string, color = "#3b82f6"): string {
  return `<a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 24px; background: ${color}; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 500; margin-top: 16px;">${escapeHtml(label)}</a>`;
}

export function taskAssignedEmail(taskLabel: string, workflowTitle: string, instanceUrl: string) {
  return {
    subject: `[WorkFlowPro] Task assigned: ${taskLabel}`,
    html: emailWrapper(`
      <h2 style="color: #f8fafc; margin-top: 0;">New Task Assigned</h2>
      <p>You've been assigned <strong style="color: #f8fafc;">${escapeHtml(taskLabel)}</strong> in workflow <strong style="color: #f8fafc;">${escapeHtml(workflowTitle)}</strong>.</p>
      ${actionButton("View Task", instanceUrl)}
    `),
  };
}

export function approvalRequestedEmail(taskLabel: string, workflowTitle: string, instanceUrl: string) {
  return {
    subject: `[WorkFlowPro] Approval needed: ${taskLabel}`,
    html: emailWrapper(`
      <h2 style="color: #f8fafc; margin-top: 0;">Approval Requested</h2>
      <p>Your approval is requested for <strong style="color: #f8fafc;">${escapeHtml(taskLabel)}</strong> in workflow <strong style="color: #f8fafc;">${escapeHtml(workflowTitle)}</strong>.</p>
      ${actionButton("Review & Decide", instanceUrl, "#8b5cf6")}
    `),
  };
}

export function approvalDecisionEmail(
  taskLabel: string,
  decision: "APPROVED" | "REJECTED",
  deciderName: string,
  instanceUrl: string,
) {
  const verb = decision === "APPROVED" ? "approved" : "rejected";
  const color = decision === "APPROVED" ? "#10b981" : "#ef4444";
  return {
    subject: `[WorkFlowPro] ${taskLabel} — ${verb}`,
    html: emailWrapper(`
      <h2 style="color: ${color}; margin-top: 0;">Request ${verb.charAt(0).toUpperCase() + verb.slice(1)}</h2>
      <p><strong style="color: #f8fafc;">${escapeHtml(deciderName)}</strong> ${verb} <strong style="color: #f8fafc;">${escapeHtml(taskLabel)}</strong>.</p>
      ${actionButton("View Details", instanceUrl)}
    `),
  };
}

export function workflowCompletedEmail(workflowTitle: string, instanceUrl: string) {
  return {
    subject: `[WorkFlowPro] Workflow completed: ${workflowTitle}`,
    html: emailWrapper(`
      <h2 style="color: #10b981; margin-top: 0;">Workflow Completed</h2>
      <p><strong style="color: #f8fafc;">${escapeHtml(workflowTitle)}</strong> has been completed successfully.</p>
      ${actionButton("View Summary", instanceUrl, "#10b981")}
    `),
  };
}

export function taskCompletedEmail(taskLabel: string, completedByName: string, workflowTitle: string, instanceUrl: string) {
  return {
    subject: `[WorkFlowPro] Task completed: ${taskLabel}`,
    html: emailWrapper(`
      <h2 style="color: #10b981; margin-top: 0;">Task Completed</h2>
      <p><strong style="color: #f8fafc;">${escapeHtml(completedByName)}</strong> completed <strong style="color: #f8fafc;">${escapeHtml(taskLabel)}</strong> in workflow <strong style="color: #f8fafc;">${escapeHtml(workflowTitle)}</strong>.</p>
      ${actionButton("View Workflow", instanceUrl, "#10b981")}
    `),
  };
}

export function workflowCancelledEmail(workflowTitle: string, instanceUrl: string) {
  return {
    subject: `[WorkFlowPro] Workflow cancelled: ${workflowTitle}`,
    html: emailWrapper(`
      <h2 style="color: #ef4444; margin-top: 0;">Workflow Cancelled</h2>
      <p><strong style="color: #f8fafc;">${escapeHtml(workflowTitle)}</strong> has been cancelled.</p>
      ${actionButton("View Details", instanceUrl, "#64748b")}
    `),
  };
}

export function commentAddedEmail(commenterName: string, workflowTitle: string, instanceUrl: string) {
  return {
    subject: `[WorkFlowPro] New comment on: ${workflowTitle}`,
    html: emailWrapper(`
      <h2 style="color: #f8fafc; margin-top: 0;">New Comment</h2>
      <p><strong style="color: #f8fafc;">${escapeHtml(commenterName)}</strong> commented on <strong style="color: #f8fafc;">${escapeHtml(workflowTitle)}</strong>.</p>
      ${actionButton("View Comment", instanceUrl)}
    `),
  };
}

export function welcomeEmail(name: string, email: string, tempPassword: string, loginUrl: string) {
  return {
    subject: `[WorkFlowPro] Welcome to WorkFlowPro, ${name}!`,
    html: emailWrapper(`
      <h2 style="color: #f8fafc; margin-top: 0;">Welcome to WorkFlowPro</h2>
      <p>Hi <strong style="color: #f8fafc;">${escapeHtml(name)}</strong>, your account has been created.</p>
      <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0; font-size: 13px;"><strong style="color: #94a3b8;">Email:</strong> <span style="color: #f8fafc;">${escapeHtml(email)}</span></p>
        <p style="margin: 4px 0; font-size: 13px;"><strong style="color: #94a3b8;">Temporary Password:</strong> <code style="background: #0f172a; padding: 2px 8px; border-radius: 4px; color: #fbbf24;">${escapeHtml(tempPassword)}</code></p>
      </div>
      <p style="color: #f59e0b; font-size: 13px;">Please change your password after your first login.</p>
      ${actionButton("Sign In", loginUrl)}
    `),
  };
}

export function twoFactorCodeEmail(name: string, code: string) {
  return {
    subject: `[WorkFlowPro] Your verification code: ${code}`,
    html: emailWrapper(`
      <h2 style="color: #f8fafc; margin-top: 0;">Two-Factor Verification</h2>
      <p>Hi <strong style="color: #f8fafc;">${escapeHtml(name)}</strong>, use the code below to complete your sign-in.</p>
      <div style="background: #1e293b; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #3b82f6; font-family: 'Courier New', monospace;">${escapeHtml(code)}</span>
      </div>
      <p style="font-size: 13px; color: #94a3b8;">This code expires in <strong style="color: #f8fafc;">10 minutes</strong>. If you did not request this, please change your password immediately.</p>
    `),
  };
}

export function passwordResetEmail(name: string, resetUrl: string) {
  return {
    subject: `[WorkFlowPro] Password reset request`,
    html: emailWrapper(`
      <h2 style="color: #f8fafc; margin-top: 0;">Password Reset</h2>
      <p>Hi <strong style="color: #f8fafc;">${escapeHtml(name)}</strong>, we received a request to reset your password.</p>
      <p>Click the button below to set a new password. This link expires in 1 hour.</p>
      ${actionButton("Reset Password", resetUrl, "#f59e0b")}
      <p style="font-size: 12px; margin-top: 24px; color: #64748b;">If you didn't request this, you can safely ignore this email.</p>
    `),
  };
}
