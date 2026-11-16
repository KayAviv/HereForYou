/* GoalJar lesson library — 24 bite-size lessons.
 * Each: { id, title, icon, band: '6-9' | '9-12' | 'all', topic, minutes,
 *         text: [paragraphs], tip, quiz: [{q, options:[3], answer}] }
 * Free tier unlocks the first 10 (by array order). Plain language, no ads,
 * no AI mention. Works in Node and browser (window.GoalJarLessons).
 */
(function (root) {
  'use strict';
  var L = [
    { id: 'what-is-money', title: 'What Is Money?', icon: '🪙', band: '6-9', topic: 'Money basics', minutes: 2,
      text: [
        'Money is a tool people use to trade. Long ago, people swapped things directly — like trading apples for eggs. That was tricky! So people invented money: something everyone agrees has value.',
        'Today money can be coins, bills, or numbers in an app like this one. Money itself is not the goal — it is a tool that helps you get things you need and want.'
      ],
      tip: 'Try it: look at a Canadian $5 bill and find the picture on it. Who is it?',
      quiz: [
        { q: 'What is money?', options: ['A toy', 'A tool for trading', 'A kind of food'], answer: 1 },
        { q: 'Before money, how did people trade?', options: ['They swapped things directly', 'They used phones', 'They did not trade'], answer: 0 },
        { q: 'Is money the goal, or a tool?', options: ['The goal', 'A snack', 'A tool'], answer: 2 }
      ] },
    { id: 'coins-and-bills', title: 'Coins & Bills of Canada', icon: '🍁', band: '6-9', topic: 'Money basics', minutes: 2,
      text: [
        'In Canada we use cents and dollars. 100 cents make 1 dollar. Our coins have fun nicknames: the loonie is $1 and the toonie is $2!',
        'Smaller coins are the quarter (25¢), dime (10¢), and nickel (5¢). Bills come in $5, $10, $20, $50 and $100 — each a different colour.'
      ],
      tip: 'Try it: how many quarters make one loonie? (Answer: 4!)',
      quiz: [
        { q: 'How many cents make 1 dollar?', options: ['10', '50', '100'], answer: 2 },
        { q: 'What is a loonie worth?', options: ['$1', '$2', '25¢'], answer: 0 },
        { q: 'A quarter is worth…', options: ['5¢', '25¢', '10¢'], answer: 1 }
      ] },
    { id: 'needs-vs-wants', title: 'Needs vs Wants', icon: '⚖️', band: 'all', topic: 'Needs & wants', minutes: 2,
      text: [
        'A NEED is something you must have to live and be safe: food, water, a home, warm clothes. A WANT is something that is fun to have, like a game or candy — nice, but you can live without it.',
        'Smart money people take care of needs first, then choose wants carefully. There is nothing wrong with wants — the trick is not spending ALL your money on them!'
      ],
      tip: 'Try it: next time you shop, point at three things and say "need" or "want" for each.',
      quiz: [
        { q: 'Which one is a NEED?', options: ['A video game', 'Drinking water', 'A new toy'], answer: 1 },
        { q: 'Which one is a WANT?', options: ['Ice cream', 'A warm coat in winter', 'Medicine'], answer: 0 },
        { q: 'What should money cover first?', options: ['Wants', 'Needs', 'Neither'], answer: 1 }
      ] },
    { id: 'save-first', title: 'Save First!', icon: '🐷', band: 'all', topic: 'Saving', minutes: 2,
      text: [
        'Here is a secret grown-ups use: when money comes in, move some to saving FIRST — before spending anything. This is called "paying yourself first."',
        'If you wait and save whatever is left over, there is usually nothing left! Even saving a small part every time — like 4 coins out of every 10 — builds up surprisingly fast.'
      ],
      tip: 'Try it: next time you get money, put part of it in your Save jar before you do anything else.',
      quiz: [
        { q: '"Pay yourself first" means…', options: ['Buy a treat first', 'Save part of new money before spending', 'Spend everything'], answer: 1 },
        { q: 'When is the best time to save?', options: ['Only at New Year', 'Whenever is left over', 'As soon as money arrives'], answer: 2 },
        { q: 'If you save 4 of every 10 dollars, after $50 you saved…', options: ['$20', '$4', '$50'], answer: 0 }
      ] },
    { id: 'setting-a-goal', title: 'Setting a Saving Goal', icon: '🎯', band: 'all', topic: 'Goals', minutes: 2,
      text: [
        'Saving is easier when you know WHAT you are saving for. A goal has three parts: the thing you want, how much it costs, and when you hope to have it.',
        'Big goals feel far away, so smart savers break them into small steps. Saving $2 a week for a $20 goal means you get there in 10 weeks — that is a plan you can follow!'
      ],
      tip: 'Try it: create your first goal in GoalJar and pick a picture for it.',
      quiz: [
        { q: 'A good goal tells you…', options: ['Only the colour', 'What, how much, and when', 'Nothing'], answer: 1 },
        { q: 'A $20 goal saving $2/week takes…', options: ['2 weeks', '20 weeks', '10 weeks'], answer: 2 },
        { q: 'Big goals are easier when you…', options: ['Break them into small steps', 'Forget them', 'Spend more'], answer: 0 }
      ] },
    { id: 'three-jars', title: 'The Three Jars', icon: '🫙', band: '6-9', topic: 'Budgeting', minutes: 2,
      text: [
        'GoalJar splits your money into three jars. SPEND is for things you enjoy now. SAVE is for your goals. GIVE is for helping others.',
        'Using jars means you never have to wonder, "Can I afford this?" If your Spend jar has enough, the answer is yes — and your goals stay safe in the Save jar.'
      ],
      tip: 'Try it: move a little money between your jars and watch the balances change.',
      quiz: [
        { q: 'The SAVE jar is for…', options: ['Your goals', 'Snacks today', 'Giving away'], answer: 0 },
        { q: 'Money to help others goes in…', options: ['Spend', 'Give', 'Under the bed'], answer: 1 },
        { q: 'Why use jars?', options: ['To hide money', 'So every dollar has a job', 'To make money heavier'], answer: 1 }
      ] },
    { id: 'earning-money', title: 'Earning Money', icon: '💪', band: 'all', topic: 'Earning', minutes: 2,
      text: [
        'Earning means getting money by adding value — doing a job, helping someone, or making something people want. Grown-ups earn at jobs; kids can earn with chores and helping neighbours.',
        'The more skills you learn, the more ways you can earn. Learning itself is like planting seeds for future earning!'
      ],
      tip: 'Try it: think of one helpful job you could do this week. Ask a parent about it.',
      quiz: [
        { q: 'Earning money means…', options: ['Finding it on the street', 'Getting money for adding value', 'Asking for more allowance'], answer: 1 },
        { q: 'Which is earning?', options: ['Washing the car for $5', 'A birthday gift', 'Finding a coin'], answer: 0 },
        { q: 'Learning new skills helps you…', options: ['Sleep longer', 'Spend faster', 'Earn in more ways'], answer: 2 }
      ] },
    { id: 'chores-and-jobs', title: 'Chores & Helping Jobs', icon: '🧹', band: '6-9', topic: 'Earning', minutes: 2,
      text: [
        'Chores are jobs at home: tidying, feeding a pet, taking out recycling. Doing them well — without being asked twice — is how you show you are ready for bigger jobs.',
        'In GoalJar, when you finish a chore, a parent checks it and your chore money lands in your jar. Good work, every time, builds trust — and trust brings bigger opportunities.'
      ],
      tip: 'Try it: finish a chore today and mark it done in the Earn tab.',
      quiz: [
        { q: 'A chore is…', options: ['A job that helps at home', 'A video', 'A snack'], answer: 0 },
        { q: 'Doing chores well builds…', options: ['Mountains', 'Trust', 'Nothing'], answer: 1 },
        { q: 'In GoalJar, chore money lands when…', options: ['You wish for it', 'You mark it done AND a parent approves', 'Never'], answer: 1 }
      ] },
    { id: 'allowance-smarts', title: 'Allowance Smarts', icon: '📅', band: '9-12', topic: 'Budgeting', minutes: 3,
      text: [
        'An allowance is practice money: a set amount you receive on a schedule, so you can learn to make it last. The real lesson is not the amount — it is stretching it between paydays.',
        'Pros split allowance the moment it arrives: part to Spend, part to Save, part to Give. Decide your split once, and GoalJar follows it every week automatically.'
      ],
      tip: 'Try it: if your allowance is $10, what split would you choose? Why?',
      quiz: [
        { q: 'The main point of allowance is…', options: ['Getting rich', 'Practising making money last', 'Buying candy'], answer: 1 },
        { q: 'A smart first move when allowance arrives is…', options: ['Spend it all', 'Hide it', 'Split it into your jars'], answer: 2 },
        { q: 'Making money last until next week is called…', options: ['Budgeting', 'Guessing', 'Borrowing'], answer: 0 }
      ] },
    { id: 'making-a-budget', title: 'Making a Simple Budget', icon: '📋', band: '9-12', topic: 'Budgeting', minutes: 3,
      text: [
        'A budget is a plan for your money BEFORE you spend it. It has two sides: money coming IN (allowance, chores, gifts) and money going OUT (spending, saving, giving).',
        'A good budget gives every dollar a job. When the plan says a dollar is for saving, it stays saved — even when a shiny want appears.'
      ],
      tip: 'Try it: plan next week. How much comes in? Where should each dollar go?',
      quiz: [
        { q: 'A budget is…', options: ['A plan made before spending', 'A list of wishes', 'A type of coin'], answer: 0 },
        { q: 'The two sides of a budget are…', options: ['Day and night', 'Money in and money out', 'Big and small'], answer: 1 },
        { q: '"Every dollar has a job" means…', options: ['Dollars go to school', 'You decide in advance where money goes', 'Dollars wear uniforms'], answer: 1 }
      ] },
    { id: 'price-detective', title: 'Price Detective', icon: '🔎', band: '9-12', topic: 'Smart spending', minutes: 3,
      text: [
        'The same item can cost very different amounts in different places. Price detectives compare before they buy: check another store, look at the price per piece, and watch for sales.',
        'Example: 6 juice boxes for $3 is 50¢ each. 10 for $6 is 60¢ each — the bigger box is NOT always the better deal!'
      ],
      tip: 'Try it: compare two sizes of something at the store. Which costs less per piece?',
      quiz: [
        { q: '4 pens for $2 cost each…', options: ['50¢', '$1', '25¢'], answer: 0 },
        { q: 'The bigger package is…', options: ['Always cheaper per piece', 'Always worse', 'Not always cheaper per piece — check!'], answer: 2 },
        { q: 'A price detective…', options: ['Buys the first thing seen', 'Compares prices first', 'Never buys anything'], answer: 1 }
      ] },
    { id: 'waiting-power', title: 'Waiting Power', icon: '⏳', band: 'all', topic: 'Patience', minutes: 2,
      text: [
        'Waiting power means pausing before you buy. Many "I NEED it!" feelings fade after a day or two. Savers use the 24-hour rule: for a want, wait a day. If you still want it tomorrow, it might be worth it.',
        'Waiting also lets your Save jar grow. Every day you wait, you are one day closer to the goal that really matters to you.'
      ],
      tip: 'Try it: want something today? Write it down and check tomorrow if you still want it.',
      quiz: [
        { q: 'The 24-hour rule means…', options: ['Shop for 24 hours', 'Wait a day before buying a want', 'Never buy wants'], answer: 1 },
        { q: 'Waiting before buying helps because…', options: ['Stores close', 'Prices always drop', '"Need it now" feelings often fade'], answer: 2 },
        { q: 'While you wait, your savings…', options: ['Shrink', 'Can keep growing', 'Disappear'], answer: 1 }
      ] },
    { id: 'interest-grows', title: 'Interest: Money That Grows', icon: '🌱', band: '9-12', topic: 'Growing money', minutes: 3,
      text: [
        'Interest is extra money paid to you for keeping your money saved. If a bank pays 10% interest in a year, $100 saved becomes $110 — you earned $10 by waiting!',
        'The magic grows: next year you earn interest on $110, not just $100. Money growing on top of growth is called compound growth — it rewards people who start early and stay patient.'
      ],
      tip: 'Try it: ask about the "Bank of Mom & Dad" bonus in Parent settings — pretend interest that teaches real patience.',
      quiz: [
        { q: 'Interest is…', options: ['A fee you pay', 'Extra money for keeping savings', 'A kind of tax'], answer: 1 },
        { q: '$100 at 10% interest for a year becomes…', options: ['$100', '$105', '$110'], answer: 2 },
        { q: 'Compound growth means…', options: ['Growth on top of earlier growth', 'Money doubles daily', 'Saving is pointless'], answer: 0 }
      ] },
    { id: 'bank-of-mom-dad', title: 'The Bank of Mom & Dad', icon: '🏦', band: 'all', topic: 'Growing money', minutes: 2,
      text: [
        'In GoalJar, all money is pretend tracking — your real dollars stay safely with your parents. Some families turn on a playful bonus: "Bank of Mom & Dad interest," where parents add a small pretend bonus to the Save jar to reward patience.',
        'It is a teaching game, not a real bank. Real banks keep money in actual accounts; GoalJar just keeps the count so you can practise.'
      ],
      tip: 'Try it: check your Save jar each week. Is your patience growing it?',
      quiz: [
        { q: 'Where does your real money stay?', options: ['Inside the app', 'With your parents', 'At school'], answer: 1 },
        { q: 'GoalJar is…', options: ['A real bank', 'A tracker and teacher', 'A store'], answer: 1 },
        { q: 'Pretend bonus interest teaches…', options: ['Patience pays', 'Spending fast', 'Nothing'], answer: 0 }
      ] },
    { id: 'giving-feels-good', title: 'Giving & Sharing', icon: '❤️', band: 'all', topic: 'Giving', minutes: 2,
      text: [
        'Money can help people, animals, and places you care about. That is what the Give jar is for. Even small gifts matter: a few dollars can buy supplies for an animal shelter or seeds for a community garden.',
        'Giving works best as a plan, not an afterthought — that is why the Give jar gets a share of money when it arrives, just like Spend and Save.'
      ],
      tip: 'Try it: pick a cause you care about and set a small giving goal.',
      quiz: [
        { q: 'The Give jar is for…', options: ['Helping others', 'Extra snacks', 'Hiding money'], answer: 0 },
        { q: 'Smart givers…', options: ['Give only leftovers', 'Plan giving when money arrives', 'Never give'], answer: 1 },
        { q: 'Small gifts…', options: ['Do not matter', 'Are embarrassing', 'Can still make a real difference'], answer: 2 }
      ] },
    { id: 'money-in-out', title: 'Money In, Money Out', icon: '🔄', band: '6-9', topic: 'Tracking', minutes: 2,
      text: [
        'Every time money moves, it goes IN (you receive it) or OUT (you spend or give it). Writing it down — like the lists in GoalJar — means you always know where your money went.',
        'When kids say "my money disappeared!", it usually went out in small pieces: a treat here, a small toy there. Tracking shows the story of your money.'
      ],
      tip: 'Try it: open My Week and find your biggest money-out this week. Do you remember it?',
      quiz: [
        { q: 'Birthday money from Grandma is money…', options: ['Out', 'In', 'Lost'], answer: 1 },
        { q: 'Buying a sticker pack is money…', options: ['In', 'Out', 'Standing still'], answer: 1 },
        { q: 'Tracking your money helps you…', options: ['Know where it went', 'Make it invisible', 'Spend more'], answer: 0 }
      ] },
    { id: 'big-wants-small-steps', title: 'Big Wants, Small Steps', icon: '🪜', band: 'all', topic: 'Goals', minutes: 2,
      text: [
        'A bike, a game console, a telescope — big wants can cost more than you have. That does not mean "never." It means "step by step."',
        'GoalJar tells you your pace: "At this pace, your goal in 6 weeks." Small steps, taken every week, climb big mountains. Skipping one week is okay — quitting is the only step that stops you.'
      ],
      tip: 'Try it: look at your goal jar. What is ONE small step you can take this week?',
      quiz: [
        { q: 'A big want you cannot afford yet means…', options: ['Give up', 'Save step by step', 'Borrow from a friend'], answer: 1 },
        { q: '"Weeks to goal" is based on…', options: ['Your saving pace', 'Luck', 'The weather'], answer: 0 },
        { q: 'Missing one week of saving means…', options: ['You failed forever', 'Just keep going', 'Delete the goal'], answer: 1 }
      ] },
    { id: 'mistakes-teach', title: 'Mistakes Are Teachers', icon: '🧭', band: '9-12', topic: 'Smart spending', minutes: 3,
      text: [
        'Everyone makes money mistakes — buying something that broke in a day, or spending goal money on a whim. A mistake is only wasted if you learn nothing from it.',
        'After a purchase, ask: "Was it worth it?" GoalJar asks you the same thing with a smiley scale. Honest answers turn small mistakes now into smart choices later, when the amounts are bigger.'
      ],
      tip: 'Try it: think of one past purchase. Worth it, or lesson learned? No shame either way.',
      quiz: [
        { q: 'After a disappointing purchase, the best move is…', options: ['Hide it', 'Learn from it', 'Buy another'], answer: 1 },
        { q: '"Was it worth it?" answers help you…', options: ['Choose better next time', 'Feel bad forever', 'Nothing changes'], answer: 0 },
        { q: 'Making a small money mistake as a kid is…', options: ['Rare', 'The end of the world', 'Normal — and cheaper than learning as an adult'], answer: 2 }
      ] },
    { id: 'ads-and-tricks', title: 'Ads & Sneaky Tricks', icon: '🎭', band: '9-12', topic: 'Smart spending', minutes: 3,
      text: [
        'Ads are designed to make you feel "I need it NOW." Tricks include countdown timers, "only 2 left!", and showing a fake higher price crossed out. Knowing the tricks makes them weaker.',
        'Games and apps also use tricks: shiny pop-ups and "special offers" right after you lose. Your waiting power is the shield — real deals are still there tomorrow.'
      ],
      tip: 'Try it: spot one ad trick this week. What was it trying to make you feel?',
      quiz: [
        { q: '"Only 2 left!!" is usually…', options: ['A trick to rush you', 'A promise', 'A fact you must obey'], answer: 0 },
        { q: 'The best defence against ad tricks is…', options: ['Buying faster', 'Pausing and thinking', 'Never watching anything'], answer: 1 },
        { q: 'A real deal…', options: ['Vanishes in 10 seconds', 'Is usually still there tomorrow', 'Must be bought at midnight'], answer: 1 }
      ] },
    { id: 'counting-change', title: 'Counting Change', icon: '🧮', band: '6-9', topic: 'Money basics', minutes: 2,
      text: [
        'When you pay with cash, counting change checks the math. If a toy costs $3.50 and you pay with a $5 bill (a "five"), your change should be $1.50.',
        'Count up to check: from $3.50, add 50¢ to reach $4, then $1 to reach $5. 50¢ + $1 = $1.50 change. Counting up works for any amount!'
      ],
      tip: 'Try it: something costs $2.25 and you pay $5. Count up — the change is $2.75!',
      quiz: [
        { q: 'Cost $4, paid $5. Change?', options: ['$1', '$2', '50¢'], answer: 0 },
        { q: 'Cost $1.50, paid a toonie ($2). Change?', options: ['$1', '25¢', '50¢'], answer: 2 },
        { q: 'Counting up means…', options: ['Guessing', 'Adding from the cost up to what you paid', 'Counting coins by colour'], answer: 1 }
      ] },
    { id: 'streaks-and-habits', title: 'Streaks & Habits', icon: '🔥', band: 'all', topic: 'Saving', minutes: 2,
      text: [
        'A habit is something you do again and again until it feels easy. Saving a little every week is one of the strongest money habits there is.',
        'GoalJar counts your saving streak: weeks in a row with money added to Save. Streaks feel great to grow — and if one breaks, you just start a new one. Every saver has restarted. The habit is getting back up.'
      ],
      tip: 'Try it: add any amount to Save this week — even 25¢ keeps the streak alive.',
      quiz: [
        { q: 'A habit is…', options: ['Done once', 'Done again and again', 'Impossible'], answer: 1 },
        { q: 'A saving streak counts…', options: ['Weeks with money added to Save', 'Days you spend', 'Games won'], answer: 0 },
        { q: 'If a streak breaks, you should…', options: ['Give up', 'Delete the app', 'Start a new streak'], answer: 2 }
      ] },
    { id: 'borrowing-basics', title: 'Borrowing & Lending', icon: '🤝', band: '9-12', topic: 'Growing money', minutes: 3,
      text: [
        'Borrowing means using someone else\'s money and promising to pay it back. Lending is the other side. Both run on trust — and both can break friendships when promises are fuzzy.',
        'Family rule that works: only lend money you can afford to give, agree the payback plan out loud, and write it down. Grown-up borrowing (credit) charges interest — borrowing usually costs MORE than the thing itself.'
      ],
      tip: 'Try it: why is "I will pay you back someday" a weak promise? What would make it strong?',
      quiz: [
        { q: 'Borrowed money must be…', options: ['Forgotten', 'Paid back as promised', 'Spent twice'], answer: 1 },
        { q: 'A safe lending rule is…', options: ['Lend everything you have', 'Only lend what you can afford to give', 'Never write anything down'], answer: 1 },
        { q: 'Interest on borrowing means…', options: ['Borrowing costs extra', 'Borrowing is free', 'Lending is banned'], answer: 0 }
      ] },
    { id: 'rainy-day-stash', title: 'The Rainy-Day Stash', icon: '☂️', band: '9-12', topic: 'Saving', minutes: 3,
      text: [
        'Surprises happen: a bike tire pops, a library book is lost, a friend\'s birthday party appears. A rainy-day stash is savings kept for surprises — not for a goal, just for "just in case."',
        'Grown-ups call it an emergency fund, and it is one of the biggest differences between people who panic about money and people who stay calm. Start tiny: even $5 set aside is a real stash.'
      ],
      tip: 'Try it: create a second goal called "Rainy-Day Stash" with a small target, like $10.',
      quiz: [
        { q: 'A rainy-day stash is for…', options: ['Rain boots only', 'Surprises and small emergencies', 'Daily treats'], answer: 1 },
        { q: 'Grown-ups call it an…', options: ['Emergency fund', 'Allowance', 'Budget trick'], answer: 0 },
        { q: 'A good first stash target is…', options: ['$10,000', 'Nothing', 'Small — like $5–$10'], answer: 2 }
      ] },
    { id: 'my-money-plan', title: 'My Money Plan', icon: '🗺️', band: 'all', topic: 'Capstone', minutes: 3,
      text: [
        'You have learned the whole loop: earn, save first, split into jars, set goals, wait, compare prices, give, and track it all. A money plan is just those steps written down for YOU.',
        'My plan example: "When money arrives: 50% Spend, 40% Save to my goal, 10% Give. Wants wait 24 hours. Every Sunday I check my jars." Your numbers can differ — the plan is what matters.'
      ],
      tip: 'Try it: say your money plan out loud to a parent. If you can say it, you own it.',
      quiz: [
        { q: 'A money plan is…', options: ['Your personal rules for money, decided ahead', 'A shopping list', 'A secret'], answer: 0 },
        { q: 'The full money loop starts with…', options: ['Spending', 'Earning and saving first', 'Borrowing'], answer: 1 },
        { q: 'Checking your jars weekly helps you…', options: ['Stay on plan', 'Spend secretly', 'Forget your goals'], answer: 0 }
      ] }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  root.GoalJarLessons = L;
})(typeof window !== 'undefined' ? window : globalThis);
