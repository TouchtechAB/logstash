import axios from "axios";
import axiosRetry from "axios-retry";
import PQueue from "p-queue";

type Options = {
  retryDelay: number;
  concurrency: number;
  maxMessagesPerSecond: number;
  muteConsole: boolean;
};

function create(url: string, tags: Array<string>, level: string, options: Options) {
  return Logstash(url, tags, level, options);
}

function Logstash(url: string, tags: Array<string> = [], level: string = "info", options: Options) {
  if (!url) {
    throw new TypeError("Invalid URL");
  }

  this.url = url;
  this.tags = tags;
  this.level = level;
  this.maxRetries = this.maxRetries || 10;
  this.retryDelay = options.retryDelay || 10000;
  this.concurrency = options.concurrency || 25;
  this.maxMessagesPerSecond = options.maxMessagesPerSecond || 10;
  this.muteConsole = options.muteConsole === true || false;

  this.client = axios.create();

  axiosRetry(this.client, {
    retries: this.maxRetries,
    retryDelay: () => this.retryDelay
  });

  this.queue = new PQueue({
    concurrency: this.concurrency,
    intervalCap: this.maxMessagesPerSecond,
    interval: 1000
  });
}

Logstash.prototype._sendEvent = async function _sendEvent(event: any) {
  return this.client({
    url: this.url,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: event
  }).catch((err: { message: any; }) =>
    console.warn(`Could not send message to Logstash - [${err.message}]`)
  );
};

type Event = {
  "@timestamp"?: string;
  "@tags"?: string;
  level: string;
  fields: Array<string>;
  message: string;
  navigator?: any;
  location?: any;
};

Logstash.prototype.log = function log(level: string, message: string, fields: any) {
  const event: Event = { level, fields, message };

  event["@timestamp"] = new Date().toISOString();
  event["@tags"] = this.tags;

  // Navigator metadata
  if (typeof navigator !== "undefined") {
    event.navigator = {
      cookieEnabled: navigator.cookieEnabled,
      geoLocation: navigator.geolocation,
      language: navigator.language,
      languages: navigator.languages,
      online: navigator.onLine,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor
    };
  }

  // Location metadata
  if (typeof location !== "undefined") {
    event.location = {
      search: location.search,
      pathname: location.pathname,
      hostname: location.hostname,
      protocol: location.protocol,
      port: location.port,
      hash: location.hash,
      href: location.href
    };
  }

  // Add to queue
  this.queue.add(() => this._sendEvent(event));

  if (this.muteConsole) {
    return;
  }

  const fieldsStr = fields ? ` - ${JSON.stringify(fields)}` : "";

  switch (level) {
    case "error":
      console.error(`${message}${fieldsStr}`);
      break;
    case "warn":
      console.warn(`${message}${fieldsStr}`);
      break;
    default:
      console.info(`${message}${fieldsStr}`);
  }
};

Logstash.prototype.debug = function debug(message: string, fields: any) {
  this.log("debug", message, fields);
};

Logstash.prototype.info = function info(message: string, fields: any) {
  this.log("info", message, fields);
};

Logstash.prototype.warn = function warn(message: string, fields: any) {
  this.log("warn", message, fields);
};

Logstash.prototype.error = function error(err: Error | any, fields: any) {
  if (err instanceof Error) {
    this.log("error", err.message, {...fields, stack: err.stack });
  } else {
    this.log("error", err, fields);
  }
};

export default create;
