import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import { env } from "../config/env";

export interface EmailMessageInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface CredentialsEmailInput {
  to: string;
  firstName: string;
  clubName: string;
  login: string;
  password: string;
  additionalCredentials?: Array<{
    label: string;
    login: string;
    password: string;
  }>;
}

class EmailService {
  private readonly resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;
  private readonly transporter: Transporter | null =
    env.smtpHost && env.smtpUser && env.smtpPass
      ? nodemailer.createTransport({
          host: env.smtpHost,
          port: env.smtpPort,
          secure: env.smtpSecure,
          auth: {
            user: env.smtpUser,
            pass: env.smtpPass,
          },
        })
      : null;

  isConfigured(): boolean {
    return Boolean(this.resend || this.transporter);
  }

  async sendEmail(input: EmailMessageInput): Promise<boolean> {
    if (this.resend) {
      await this.resend.emails.send({
        from: env.mailFrom,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      return true;
    }

    if (this.transporter) {
      await this.transporter.sendMail({
        from: env.mailFrom,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      return true;
    }

    console.warn(`Email skipped for ${input.to} because no provider is configured.`);
    return false;
  }

  async sendCredentialsEmail(input: CredentialsEmailInput): Promise<boolean> {
    const additionalTextSections =
      input.additionalCredentials?.flatMap((credentials) => [
        "",
        `${credentials.label}:`,
        `Prijava: ${credentials.login}`,
        `Privremena lozinka: ${credentials.password}`,
      ]) ?? [];
    const additionalHtmlSections =
      input.additionalCredentials?.map(
        (credentials) =>
          `<p><strong>${credentials.label}</strong><br /><strong>Prijava:</strong> ${credentials.login}<br /><strong>Privremena lozinka:</strong> ${credentials.password}</p>`,
      ) ?? [];
    const subject = `${input.clubName} - pristupni podaci`;
    const text = [
      `Pozdrav ${input.firstName},`,
      "",
      `Vaš račun za klub ${input.clubName} je spreman.`,
      `Prijava: ${input.login}`,
      `Privremena lozinka: ${input.password}`,
      ...additionalTextSections,
      "",
      "Prijavite se i promijenite lozinku pri prvom pristupu.",
    ].join("\n");

    const html = [
      `<p>Pozdrav ${input.firstName},</p>`,
      `<p>Vaš račun za klub <strong>${input.clubName}</strong> je spreman.</p>`,
      `<p><strong>Prijava:</strong> ${input.login}<br /><strong>Privremena lozinka:</strong> ${input.password}</p>`,
      ...additionalHtmlSections,
      "<p>Prijavite se i promijenite lozinku pri prvom pristupu.</p>",
    ].join("");

    return this.sendEmail({
      to: input.to,
      subject,
      text,
      html,
    });
  }
}

export const emailService = new EmailService();
