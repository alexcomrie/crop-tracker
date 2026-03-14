Now I have a very complete picture. Let me build a detailed, well-structured visual explanation.Here's a detailed breakdown of how every part of the Continuous Harvest feature works, from the moment you're asked about it to how it ripples through your calendar, reminders, and reports.Here's the full picture, walking through each stage:

**The question and the smart default.** When you log a crop, the system doesn't just ask blindly — it looks the crop up in the database first. If the crop's `number_of_weeks_harvest` is greater than 1, it pre-selects "Yes" for you. You can always override it.

**What your answer actually changes.** The answer gets saved as "yes" or "no" in column 14 of your CropTracking sheet. Every time a harvest is logged later, the code checks that single cell to decide whether to close the crop or keep it alive.

**Batch planting dates.** This only triggers for continuous crops. The system calculates a rolling series of future planting dates (every `batch_offset_days`, defaulting to 14) stretching 3 months ahead, drops calendar events for each, and queues a reminder 3 days before each one. When you confirm a batch was planted via Telegram, the old calendar event is deleted and the next one is created automatically.

**Each harvest logged.** For a continuous crop, every logged harvest increments a counter in the HarvestLog sheet (Harvest #1, #2, #3...) and updates the last harvest date — but crucially, the status stays "Active." For a single-harvest crop, the status flips to "Harvested" and everything stops.

**The learning engine.** Both crop types feed this. If your actual harvest date is 2+ days off from the estimate, the deviation gets recorded. After 3 real harvests for the same crop, your personal average overrides the database default — and you get a Telegram notification when this happens.

**Overdue alerts.** These fire every morning at 7 AM. Because continuous crops stay "Active," they keep being scanned — meaning you can get overdue alerts repeatedly across a long growing season, not just once.

**Gap calendar.** A continuous crop with 4 weeks of harvest fills 4 weeks on the calendar. A single-harvest cabbage fills one. Gaps (weeks with no coverage) show up red and prompt you to plant something new.