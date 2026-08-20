// Setup-screen dropdown options. Edit these lists as terms/campuses/classes change.
const SCHOOL_YEARS = ["Fall 2026", "Spring 2027"];
const CAMPUSES = ["Wilbur Wright", "Harold Washington"];
const CLASSES = ["Math 204-1", "Math 207"];

// Auto-filled for guest/tester play — deliberately NOT in the CAMPUSES/
// CLASSES lists above, so a real student can never select these by
// accident from the normal dropdowns. GUEST_CLASS must match a key in
// curriculum.js's WEEKLY_CURRICULUM.
const GUEST_CAMPUS = "Training Grounds";
const GUEST_CLASS = "Guest Practice";
