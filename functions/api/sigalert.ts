/**
 * Cloudflare Pages Function — same-origin SigAlert proxy.
 * Browser cannot call sigalert.com (CORS). Desktop still uses the Tauri command.
 */
import {
  fetchSigalertFeedViaHttp,
  sigalertErrorJsonResponse,
  sigalertFeedJsonResponse,
} from "../../src/lib/sigalertHttp";

export async function onRequestGet(): Promise<Response> {
  try {
    const feed = await fetchSigalertFeedViaHttp();
    return sigalertFeedJsonResponse(feed);
  } catch (err) {
    return sigalertErrorJsonResponse(err);
  }
}
