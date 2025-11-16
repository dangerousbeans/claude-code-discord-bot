import { AttachmentBuilder } from "discord.js";
import { spawn } from "child_process";

/**
 * Detects if a message contains a localhost URL that should be screenshotted
 */
export function detectScreenshotUrl(text: string): string | null {
  // First check for explicit http://localhost URLs with paths
  const explicitMatch = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+[^\s]*/i);
  if (explicitMatch) {
    return explicitMatch[0];
  }

  // Then match localhost URLs without http:// prefix
  const urlPatterns = [
    /(?:localhost):(\d+)/i,
    /(?:127\.0\.0\.1):(\d+)/i,
    /(?:0\.0\.0\.0):(\d+)/i,
  ];

  for (const pattern of urlPatterns) {
    const match = text.match(pattern);
    if (match) {
      const port = match[1];
      return `http://localhost:${port}`;
    }
  }

  return null;
}

/**
 * Captures a screenshot of a URL using puppeteer
 */
export async function captureScreenshot(url: string): Promise<Buffer | null> {
  try {
    console.log(`Attempting to capture screenshot of ${url}`);

    // Use puppeteer to capture screenshot
    const puppeteer = await import("puppeteer");

    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate to URL with timeout
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 10000
    });

    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false
    });

    await browser.close();

    console.log(`Successfully captured screenshot of ${url}`);
    return screenshot;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    return null;
  }
}

/**
 * Posts a screenshot to a Discord channel
 */
export async function postScreenshot(
  channel: any,
  url: string,
  screenshotBuffer: Buffer
): Promise<void> {
  try {
    const attachment = new AttachmentBuilder(screenshotBuffer, {
      name: 'screenshot.png',
      description: `Screenshot of ${url}`
    });

    await channel.send({
      content: `📸 Screenshot of ${url}`,
      files: [attachment]
    });

    console.log(`Posted screenshot of ${url} to Discord`);
  } catch (error) {
    console.error('Error posting screenshot to Discord:', error);
  }
}

/**
 * Main function to handle screenshot detection and capture
 */
export async function handleScreenshotDetection(
  text: string,
  channel: any
): Promise<void> {
  const url = detectScreenshotUrl(text);

  if (!url) {
    return;
  }

  console.log(`Detected screenshot-worthy URL: ${url}`);

  // Wait a bit for the server to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));

  const screenshot = await captureScreenshot(url);

  if (screenshot) {
    await postScreenshot(channel, url, screenshot);
  } else {
    console.log('Failed to capture screenshot, skipping Discord post');
  }
}
