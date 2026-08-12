import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db, ContactMessages, User, eq } from "astro:db";
import { buildContactAdminEmail } from "@/lib/contactEmail";
import { sendEmail } from "@/lib/email";
import { emitEvent } from "@/lib/events";

export const contact = {
  send: defineAction({
    accept: "form",
    input: z.object({
      type: z.enum(["contact", "incident"]),
      subject: z.string().trim().min(1).max(120),
      message: z.string().trim().min(1).max(2000)
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) {
        throw new ActionError({ code: "UNAUTHORIZED", message: "errorUnauthorized" });
      }
      if (user.disabled) {
        throw new ActionError({ code: "FORBIDDEN", message: "errorDisabled" });
      }

      const id = crypto.randomUUID();
      await db.insert(ContactMessages).values({
        id,
        userId: user.id,
        type: input.type,
        subject: input.subject,
        message: input.message,
        createdAt: new Date()
      });

      await emitEvent({
        type: "contact.submitted",
        actorUserId: user.id,
        payload: { contactMessageId: id, type: input.type }
      });

      try {
        const admins = await db.select({ email: User.email }).from(User).where(eq(User.role, "admin"));
        const { subject, html, text } = buildContactAdminEmail(context.locals.t, context.locals.locale, {
          name: user.name,
          email: user.email,
          type: input.type,
          subject: input.subject,
          message: input.message
        });
        await Promise.all(
          admins.map((admin) =>
            sendEmail({
              to: admin.email,
              subject,
              html,
              text,
              tags: { type: "contact_submitted", locale: context.locals.locale },
              idempotencyKey: `contact-${id}-${admin.email}`
            })
          )
        );
      } catch (err) {
        console.error("Failed to send contact notification email:", err);
      }

      return { success: true };
    }
  })
};
