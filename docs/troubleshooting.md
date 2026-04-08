# Troubleshooting

If something is not working as expected, this page covers the most common issues and how to resolve them. If your problem is not listed, please [open an issue](https://github.com/effyyy/PromptGnome/issues/new/choose) and we will help.

## The extension is not detecting anything on a specific provider

1. Check the [supported providers status page](supported-providers.md) — the provider may currently be marked degraded or broken while we ship a fix.
2. Make sure you are on the exact domain we support. Look-alike domains and beta subdomains are not covered.
3. Reload the chatbot tab after installing or updating the extension.
4. Open the side panel and confirm the provider is enabled in your settings.
5. If everything looks right and detection still does not run, please file a provider breakage issue with your extension version, browser, and OS.

## The warning overlay does not appear

1. Confirm that the detection itself is happening — open the side panel and check whether your statistics counter for that type increases when you type test data.
2. Some site themes or accessibility tools can interfere with the overlay's positioning. Try a fresh tab.
3. If you have other privacy or content-blocker extensions installed, try temporarily disabling them to see whether one of them is hiding the overlay.
4. If the issue persists, file a bug report with a screenshot.

## Re-hydration is not replacing placeholders in the response

Re-hydration is a Pro feature and only runs after auto-anonymize has been used.

1. Confirm you have a Pro subscription and that auto-anonymize was active for the original message.
2. Wait for the response to finish streaming. Re-hydration runs after the response completes, not as it streams.
3. If the response is very long, re-hydration may take a moment to complete.
4. If placeholders remain visible after the response is fully rendered, file a bug report with the provider name and the placeholder text you saw.

## The extension shows "scanning..." indefinitely

1. This usually indicates that the on-device detection model has stalled. Reload the tab.
2. If it happens repeatedly, try disabling and re-enabling Pro on-device detection in settings.
3. If the issue persists, your device may be low on memory. Close some tabs and try again.
4. Persistent stalls should be reported as a bug.

## I cannot find the side panel

- **Chrome / Edge**: click the puzzle-piece icon in the toolbar, find PromptGnome, and pin it. Then click the PromptGnome icon and choose "Open side panel".
- **Firefox**: open the sidebar from the menu and select PromptGnome.

## Pro features are not unlocking after purchase

1. Restart your browser. The license check runs at startup.
2. If that does not help, open the side panel and use the "Refresh license" option.
3. Confirm in your ExtensionPay account dashboard that the subscription is active.
4. If everything checks out and Pro is still locked, email **contact@promptgnome.com** with your order details and we will sort it out.

## The extension is making the page feel slower

1. Detection on the free tier should add no perceptible latency. If you are noticing slowness, the on-device NER model is the most likely cause.
2. Try turning off Pro on-device detection temporarily in settings to confirm.
3. Some older devices struggle with the model. You can switch to "Free tier only" mode and still get the regex detections.
4. If the slowness is happening on the free tier alone, please file a bug report with your device and browser details — that should not happen.

## The extension stops working after a chatbot update

This usually means the chatbot's internal API changed and our adapter needs an update. Please file a [provider breakage issue](https://github.com/effyyy/PromptGnome/issues/new/choose) with the date you noticed and any details. We watch this label closely and ship fixes as quickly as we can.

## I uninstalled and reinstalled, but my old settings came back

If you have your browser's sync feature enabled, your PromptGnome settings sync along with your other extension data. Disable sync for extensions or clear the synced data to reset.

## My question is not here

Please [open an issue](https://github.com/effyyy/PromptGnome/issues/new/choose) or email **contact@promptgnome.com**. Common issues get added to this page over time.
