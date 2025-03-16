import { Cron } from "croner";
import { type } from "arktype";
import { Temporal } from "@js-temporal/polyfill";

const env = type({
  SLACK_WEBHOOK_URL: "string.url",
  SLACK_XOXC: "string",
  SLACK_XOXD: "string",
  SLACK_OWNER_ID: "string.upper",
  SLACK_WORKSPACE: "string",
  TIMEZONE: "string",
  CRON: "string = '55 23 * * *'",
  "+": "delete",
})(process.env);

if (env instanceof type.errors) {
  console.error(env.summary);
  process.exit(1);
}

const sendActivity = async () => {
  console.log("Calling search API...");
  const today = Temporal.Now.plainDateISO();
  const yesterday = today.subtract({ days: 1 }).toString();
  const tomorrow = today.add({ days: 1 }).toString();

  const formData = new FormData();
  formData.append("token", env.SLACK_XOXC);
  formData.append("module", "messages");
  formData.append(
    "query",
    `from:<@${env.SLACK_OWNER_ID}> before:${tomorrow} after:${yesterday}`
  );
  formData.append("page", "1");

  const response = await fetch(
    `https://${env.SLACK_WORKSPACE}.slack.com/api/search.modules.messages`,
    {
      headers: {
        accept: "*/*",
        cookie: `d=${encodeURIComponent(env.SLACK_XOXD)}`,
      },
      body: formData,
      method: "POST",
    }
  );
  const data = (await response.json()) as {
    pagination: { total_count: number };
  };
  const messagesSent = data.pagination.total_count;
  console.log(`Messages sent: ${messagesSent}`);

  const webhookResponse = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: `:chart_with_upwards_trend: <@${env.SLACK_OWNER_ID}> has sent *${messagesSent} messages* today.`,
    }),
  });
  if (!webhookResponse.ok) {
    throw new Error("Failed to send webhook");
  }
};

new Cron(env.CRON, { timezone: env.TIMEZONE }, sendActivity);
sendActivity();
