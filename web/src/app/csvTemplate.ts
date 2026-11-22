// "Download the template" in Import a CSV: the GymBro columns and a few example
// rows to overwrite. One row is one set; rows with the same Date and Session
// form one session. The example date is old on purpose, so importing the file
// unedited can't put a fake session in this week.
const EXAMPLE_DATE = '2000-01-03';
const HEADER = ['Date', 'Session', 'Exercise', 'Order', 'Set', 'Reps', 'Weight (kg)', 'Notes'].join(',');

export const CSV_TEMPLATE = [
  HEADER,
  `${EXAMPLE_DATE},A,Back Squat,1,1,5,100,`,
  `${EXAMPLE_DATE},A,Back Squat,1,2,5,100,"Notes go here, quoted if they hold a comma"`,
  `${EXAMPLE_DATE},A,Barbell Bench Press,2,1,8,70,`,
].join('\n') + '\n';
