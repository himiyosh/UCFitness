
const testDateCalculation = () => {
    console.log("System Timezone Offset:", new Date().getTimezoneOffset());
    console.log("Current System Time:", new Date().toString());

    // --- Current Logic ---
    const now = new Date();
    // Simulate specific test cases if needed, but let's test "Now" first
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const day = jstNow.getDay();
    const diff = jstNow.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(jstNow);
    monday.setDate(diff);
    const currentLogicStart = monday.toISOString().split('T')[0];

    console.log("--- Current Logic ---");
    console.log("JST Now (Shifted):", jstNow.toString());
    console.log("Day (Local):", day);
    console.log("Calculated Weekly Start:", currentLogicStart);


    // --- Robust Logic ---
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const jstDateStr = formatter.format(now); // YYYY-MM-DD

    const currentDate = new Date(`${jstDateStr}T00:00:00Z`);
    const utcDay = currentDate.getUTCDay(); // 0(Sun) - 6(Sat)
    // We want Monday start. 
    // If Sun(0) -> -6 days. 
    // If Mon(1) -> 0 days. 
    // If Tue(2) -> -1 day.
    // Formula: (Day + 6) % 7 ? No.
    // Days to subtract: (Day + 6) % 7 is days FROM Monday? 
    // Mon(1): (1+6)%7 = 0. Correct.
    // Tue(2): (2+6)%7 = 1. Correct (Subtract 1).
    // Sun(0): (0+6)%7 = 6. Correct (Subtract 6).
    const daysToSubtract = (utcDay + 6) % 7;

    const robustMonday = new Date(currentDate);
    robustMonday.setUTCDate(currentDate.getUTCDate() - daysToSubtract);
    const robustLogicStart = robustMonday.toISOString().split('T')[0];

    console.log("--- Robust Logic ---");
    console.log("JST Date String:", jstDateStr);
    console.log("UTC Day:", utcDay);
    console.log("Days to Subtract:", daysToSubtract);
    console.log("Calculated Weekly Start:", robustLogicStart);

    if (currentLogicStart !== robustLogicStart) {
        console.error("MISMATCH DETECTED!");
    } else {
        console.log("Result Matches (for this specific time).");
    }
};

testDateCalculation();
