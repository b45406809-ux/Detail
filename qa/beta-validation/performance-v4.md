# Beta validation performance report v4

Run: `2026-11-06-follow-up-3`

No app performance measurements have been taken. The Appetize inspection run only waited for a session and screenshot; it did not measure launch or API latency.

The CI-placeholder Vite build completed, but reported a minified JavaScript chunk above 500 kB. This is a build advisory only; it has not been profiled on Android, iOS, or a physical device and is not yet a measured performance failure.

| Platform | Device / OS | Network | Samples | Median | p95 | Result |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Android | Not measured | Not measured | 0 | — | — | Not run |
| iOS | Not measured | Not measured | 0 | — | — | Not run |

Future runs must separately record cold launch, warm launch, read/mutation API latency, event delivery, action-to-feedback time, spinner duration and 30-minute soak behavior. Exclude user input and external provider completion time. Targets: home usable within 2 seconds after splash, warm resume within 2 seconds, read p95 ≤1.5 seconds, mutation p95 ≤2.5 seconds, chat/event p95 ≤3 seconds, visible action feedback ≤200 ms, and no unexplained spinner beyond 10 seconds.
