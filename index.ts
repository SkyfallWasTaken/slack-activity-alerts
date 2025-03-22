import { Cron } from "croner";
import { type } from "arktype";
import { Temporal } from "@js-temporal/polyfill";
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";

const env = type({
	SLACK_WEBHOOK_URL: "string.url",
	SLACK_XOXC: "string",
	SLACK_XOXD: "string",
	SLACK_OWNER_ID: "string.upper",
	SLACK_WORKSPACE: "string",
	TIMEZONE: "string",
	CRON: "string = '59 23 * * *'",
	"MONITORING_URL?": "string.url",
	"REDIS_URL?": "string.url",
	"+": "delete",
})(process.env);

if (env instanceof type.errors) {
	console.error(env.summary);
	process.exit(1);
}

const searchResults = type({
	ok: "true",
	pagination: { total_count: "number" },
});

const keyv = new Keyv<number>(
	env.REDIS_URL !== undefined ? new KeyvRedis(env.REDIS_URL) : undefined,
);

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
		`from:<@${env.SLACK_OWNER_ID}> before:${tomorrow} after:${yesterday}`,
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
		},
	);
	const data = searchResults(await response.json());
	if (data instanceof type.errors) {
		throw new Error(data.summary);
	}
	const messagesSent = data.pagination.total_count;
	console.log(`Messages sent: ${messagesSent}`);
	const messagesSentYesterday = await keyv.get(yesterday);
	console.log(`Messages sent yesterday: ${messagesSentYesterday}`);

	const difference =
		messagesSentYesterday !== undefined
			? messagesSent - messagesSentYesterday
			: 0;

	const emoji = (() => {
		if (difference > 0) return ":chart_with_upwards_trend:";
		if (difference < 0) return ":chart_with_downwards_trend:";
		return ":chart_with_upwards_trend:";
	})();

	const differenceText = (() => {
		if (!difference) return "";
		const direction = difference > 0 ? "more" : "less";
		return ` _(${Math.abs(difference)} ${direction} than yesterday)_`;
	})();

	const message = `${emoji} <@${env.SLACK_OWNER_ID}> has sent *${messagesSent} messages* today.${differenceText}`;

	const webhookResponse = await fetch(env.SLACK_WEBHOOK_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			text: message,
		}),
	});
	if (!webhookResponse.ok) {
		throw new Error("Failed to send webhook");
	}

	await keyv.set(today.toString(), messagesSent);
	console.log("Finished job run!\n");
};

new Cron(env.CRON, { timezone: env.TIMEZONE }, sendActivity);
if (env.MONITORING_URL !== undefined) {
	new Cron("* * * * *", async () => {
		try {
			await fetch(env.MONITORING_URL as string);
		} catch {}
	});
}
console.log("Started cron job");
