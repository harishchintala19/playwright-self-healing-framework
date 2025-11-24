import fs from "node:fs";

export class HealingLogs {
  private static readonly LOG_FILE = "healing-debug.log";
  private static lastMessage = "";

  static log(message: string): void {
    if (message === this.lastMessage) return;
    this.lastMessage = message;

    const timestamp = new Date().toISOString().split("T")[1].replace("Z", "");
    const formatted = `[HEALING][${timestamp}] ${message}`;
    console.log(formatted);

    if (process.env.DEBUG_HEALING === "true") {
      try {
        fs.appendFileSync(this.LOG_FILE, formatted + "\n");
      } catch (err) {
        console.error("[HEALING LOG ERROR] Could not write to file:", err);
      }
    }
  }
}
