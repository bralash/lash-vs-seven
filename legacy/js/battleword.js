const GAME_RULES = `
<div class="rs">
  <h3>Objective</h3>
  <p>Guess the hidden 5-letter word in as few attempts as possible.</p>
</div>
<div class="rs">
  <h3>How to Play</h3>
  <ol>
    <li>Both players race to guess the same hidden word.</li>
    <li>After each guess the letters are colour-coded:
      <ul>
        <li><strong>Green</strong> — right letter, right position.</li>
        <li><strong>Yellow</strong> — right letter, wrong position.</li>
        <li><strong>Grey</strong> — letter not in the word at all.</li>
      </ul>
    </li>
    <li>Use the feedback to narrow down your next guess.</li>
  </ol>
</div>
<div class="rs">
  <h3>How to Win</h3>
  <p>The player who solves the word in fewer attempts wins. Equal attempts? The faster solve wins.</p>
</div>
<div class="lvs-rules-tip"><strong>Tip:</strong> Start with a word that covers common letters — CRANE, SLATE, or AUDIO are strong openers.</div>
`;

// ============================================================
// WORD LIST  (1800 common 5-letter English words)
// ============================================================
const WORDS = new Set([
  'aback','abbey','abide','abode','abort','about','above','abuse','abyss','acorn',
  'actor','acute','adage','admit','adopt','adult','after','again','agent','agree',
  'ahead','alarm','album','alert','alibi','alien','align','alike','alley','allow',
  'alloy','alone','aloft','aloof','aloud','alpha','altar','alter','amaze','amber',
  'amble','amend','amiss','ample','amuse','angel','anger','angle','angry','angst',
  'ankle','annex','annoy','antic','anvil','afoot','agile','aglow','agony','aisle',
  'algae','aphid','apple','apply','aptly','ardor','arena','argue','arise','armor',
  'aroma','arose','array','arson','ashen','aside','asset','atone','attic','audio',
  'audit','augur','avail','avoid','awake','awash','aware','awful','axiom','azure',
  'adorn','adept','arbor','apron','adore','abhor','abler','ached','acrid','acted',
  'added','agave','aided','aimed','aired','algal','allay','allot','amped','anted',
  'antsy','aorta','arced','argot','ascot','atoll','atrip','bacon','badge','baker',
  'balmy','banal','bandy','banjo','baron','basin','batch','beach','beard','beast',
  'beige','below','bench','berth','birth','bison','black','blade','blame','bland',
  'blank','blare','blast','blaze','bleat','bleed','blend','bless','blind','bliss',
  'block','blood','bloom','blown','blunt','blurb','blurt','blush','board','bonus',
  'boost','booth','bound','boxer','brace','braid','brain','brake','brave','bravo',
  'brawn','brawl','bread','break','breed','brick','bride','brief','brine','brink',
  'brisk','brood','brook','broth','brown','brunt','brush','brute','buggy','built',
  'bulge','bulky','bully','bunny','burly','burst','bushy','byway','babel','bloke',
  'bogus','broil','burns','butch','boozy','balsa','blimp','boast','boggy','bossy',
  'botch','broke','bumpy','buxom','bathe','bayou','belle','belly','beryl','bevel',
  'bight','birch','blimy','bloop','bluff','bolts','bonds','bongo','booby','boule',
  'brash','braze','bubby','bulgy','butts','buyer','cabin','cable','cadet','camel',
  'cameo','canal','candy','cargo','carry','carve','caste','catch','cause','cedar',
  'chain','chair','chalk','chaos','charm','chase','cheap','cheat','cheek','cheer',
  'chess','chest','chief','child','china','chive','choir','chord','chunk','civic',
  'civil','claim','clamp','clank','clash','class','clean','clear','cleft','climb',
  'cling','clone','close','cloud','clown','cluck','clump','coach','coast','cobra',
  'colon','color','comet','comic','coral','couch','could','count','court','cover',
  'craft','crane','crash','creak','creek','creep','crisp','cross','crowd','crown',
  'crush','curve','covet','clove','click','cinch','crepe','crypt','curly','cyber',
  'champ','chant','chomp','chose','clasp','cocoa','corny','craze','crimp','croak',
  'croon','curvy','chewy','comfy','covey','crawl','cache','caddy','caped','carat',
  'carol','cavil','cello','chafe','chary','cheep','chide','chink','chirp','chivy',
  'chock','chops','chuck','chump','churl','civvy','clack','clade','clang','clary',
  'clave','cleat','clomp','clout','clung','codex','combo','conga','coupe','croup',
  'creed','cress','crick','crone','cubic','cumin','cupid','cushy','cutie','cynic',
  'daily','dance','dandy','dealt','decal','decay','decoy','delta','dense','depot',
  'depth','derby','deter','devil','diner','disco','divot','dizzy','dodge','dowel',
  'draft','drain','drape','drawl','dread','dream','dregs','drill','drink','drive',
  'drone','drool','droop','drove','drown','drunk','dryer','dwarf','dwell','dwelt',
  'debut','dingo','dusty','dusky','daunt','defer','digit','dirge','ditty','dowry',
  'dunce','dying','dingy','dopey','dreck','droll','duchy','duvet','daisy','dally',
  'dazed','decor','ditzy','divvy','doggy','dolly','domly','dotty','dowdy','dozen',
  'drake','ducky','duffy','dumpy','dunno','dweeb','daffy','dated','debug','decaf',
  'delay','delve','denim','dodgy','dolce','domed','donor','donut','dorky','doubt',
  'dough','drank','dried','drier','drily','drops','drums','duffs','duped','eagle',
  'early','earth','eight','elbow','elder','elegy','elite','ember','empty','enemy',
  'enjoy','ensue','enter','envoy','equal','error','essay','evade','event','every',
  'exact','exert','exile','extra','egret','eject','epoxy','ethic','expel','edify',
  'eerie','emcee','emote','epoch','evoke','eclat','edict','edged','effed','egads',
  'elfin','emend','ender','endow','enema','enrol','equip','ergot','erode','evict',
  'exist','expat','exude','exult','fable','faint','fairy','faith','false','fancy',
  'farce','fatal','favor','feast','fence','feral','field','fifth','fifty','fight',
  'final','finch','flame','flank','flare','flash','flask','flesh','float','flock',
  'flood','floor','flour','fluid','flunk','flute','foamy','focus','force','forge',
  'forte','found','foyer','frail','frame','frank','fraud','fresh','front','frost',
  'froze','fruit','fully','funny','fuzzy','frond','fungi','funky','fryer','fetid',
  'flair','flick','flint','fling','floss','flown','fluff','folly','folio','foray',
  'forgo','freak','flirt','fluke','flume','forum','friar','frill','froth','fjord',
  'felon','fiend','fiery','fishy','fixer','fleck','flier','flung','faced','faddy',
  'faked','fangs','fanny','fatso','fatty','faunt','fawns','fecal','feels','feign',
  'femur','fends','feted','feuds','fewer','fezzy','fizzy','flack','flake','flaky',
  'flaps','flats','flaws','fleas','fleet','flews','flied','flies','flips','flits',
  'flogs','flops','flout','flows','fluky','foist','folky','fondu','fouls','foxes',
  'frays','frizz','frogs','frump','fussy','gauge','gavel','gecko','genre','ghost',
  'giant','given','gland','glass','glide','gloom','glory','gloss','glove','gnome',
  'grace','grade','grain','grand','grant','grasp','grass','grave','gravy','graze',
  'great','greed','green','greet','grief','grill','grind','groan','groom','grove',
  'growl','grunt','guard','guess','guide','guild','guile','gusto','gamut','gaudy',
  'gauze','giddy','girth','glint','gloat','gorge','gourd','graft','grail','gripe',
  'gruff','guise','ganef','gawky','geeky','ghoul','gibed','girly','glare','gleam',
  'glean','glued','glyph','golem','goose','gouge','groin','grope','gruel','grump',
  'guava','gulch','gully','gulps','gumbo','gummy','gutsy','gypsy','gayly','gazer',
  'genoa','genie','gooey','goopy','gorse','grabs','grads','grape','grays','grebe',
  'grins','grips','grits','grout','habit','handy','happy','harsh','haste','haunt',
  'haven','hatch','heave','heavy','hedge','heist','hence','herbs','heron','hired',
  'hoard','holly','horse','hound','house','hover','human','humor','hurry','hyena',
  'hyper','heart','hazel','heady','hilly','horde','hotel','humid','husky','halve',
  'homer','honey','hippo','hefty','horny','hotly','hulky','hunch','hunky','hussy',
  'hydra','hyped','hairy','hammy','hardy','harpy','hasty','hawky','helix','herby',
  'hippy','hoary','hobby','hooky','hovey','howdy','huffs','huffy','hurly','hutch',
  'ideal','idiom','image','imply','index','indie','inert','inner','input','irony',
  'issue','ivory','itchy','icing','irate','inane','infer','inter','intro','ingle',
  'ingot','inked','inlet','ionic','irons','ivied','jaunt','jazzy','jelly','jerky',
  'jewel','joker','joint','joust','judge','juice','jumpy','jaded','jowls','jiffy',
  'jilts','jingo','jived','jobby','jolly','jowly','jubil','jumbo','junky','jutty',
  'karma','kinky','knack','kneel','knife','knock','knoll','known','kiosk','knave',
  'knelt','koala','kayak','ketch','khaki','kinda','kitty','knish','knobs','knots',
  'kudos','label','lance','large','laser','later','laugh','layer','leafy','leaky',
  'learn','lease','lemon','level','light','limit','liner','links','local','lodge',
  'logic','loose','lover','lower','lucky','lunar','lyric','lapse','larva','lathe',
  'leapt','ledge','leech','lefty','lemur','libel','lithe','livid','loamy','lofty',
  'loner','lousy','lowly','lucid','lusty','latch','lying','lapel','lasso','latte',
  'leery','liege','liken','lingo','lispy','llama','lobby','loopy','lotto','lumpy',
  'lusus','lunge','lurky','magic','maker','manor','maple','match','mayor','mercy',
  'merge','metal','minty','mirth','model','mocha','moody','moose','moral','mourn',
  'mouth','movie','mower','murky','music','muted','musty','melee','money','might',
  'mango','marsh','matte','media','merch','merry','messy','metro','micro','mimic',
  'miser','misty','molar','monks','mount','muddy','mummy','mural','myrrh','macho',
  'manic','manly','mangy','march','mares','marry','masse','maxim','mealy','meaty',
  'mixer','morph','mossy','motif','motor','mucky','muggy','mulch','mushy','nasal',
  'malty','mambo','maced','macro','madly','mafic','matey','mavid','memos','meter',
  'midst','milky','mince','multi','mundo','naive','niche','night','noble','noisy',
  'north','noted','notch','novel','nurse','nutty','nifty','natty','naval','needy',
  'nervy','nexus','ninth','nomad','nymph','narco','narky','nasty','nerdy','ninja',
  'nippy','nitty','noddy','nooky','nosey','nubby','nuggy','nummy','nursy','occur',
  'ocean','offer','olive','onset','order','other','ought','outdo','owner','opera',
  'ovary','oaken','obese','offal','onion','optic','orbit','otter','outer','oxide',
  'ozone','oddly','odeum','ohmic','ombre','opine','orcas','outre','paint','panel',
  'panic','paper','party','pasta','patch','pause','peace','peach','pedal','penny',
  'phase','phone','photo','piano','piece','pilot','pinch','pithy','pixie','place',
  'plain','plane','plank','plant','plaza','plead','pluck','plumb','plume','plush',
  'point','polar','porch','power','prank','press','price','pride','privy','probe',
  'prose','proud','prove','prowl','puffy','prune','pygmy','poker','prime','plaid',
  'preen','prior','prone','prism','psalm','pleat','pouch','perch','purse','pearl',
  'petal','posse','pasty','patsy','petty','pixel','plump','polka','poppy','proxy',
  'puree','panda','parka','peeve','peppy','perky','pinto','piper','plait','plied',
  'plier','plods','plops','plows','plugs','plunk','poach','podgy','polyp','porky',
  'potty','pouty','primp','prise','prude','psych','pudgy','punch','puppy','pushy',
  'putty','pylon','queen','query','quiet','quirk','quote','quell','quaff','quark',
  'quart','quash','quasi','quest','queue','quiff','quint','quire','quite','quota',
  'radar','raise','rally','ranch','range','rapid','ratio','reach','ready','realm',
  'rebel','refer','reign','relay','rider','ridge','risky','rival','river','robot',
  'rocky','rouge','rough','round','route','rugby','ruler','rumor','rusty','rainy',
  'raven','raspy','roost','rogue','right','rabbi','rabid','ramen','react','recap',
  'relax','relic','repay','resin','retry','revue','ripen','risen','roach','rodeo',
  'rover','rupee','revel','reedy','randy','ravel','rawly','rayon','razed','rebus',
  'recut','regal','remix','rerun','reuse','rowdy','rumba','rumen','runny','rural',
  'rutty','sadly','saint','salsa','sauce','scalp','scant','scare','scarf','scene',
  'scoop','scout','seize','sense','serve','seven','shade','shaft','shake','shall',
  'shame','shape','share','shark','sharp','shave','shear','shelf','shell','shift',
  'shine','shirt','shock','shore','short','shout','shove','shown','siege','sight',
  'silly','since','sixth','skill','skull','skunk','slash','slave','sleep','slice',
  'slide','slime','slump','small','smart','smash','smile','smite','smoke','snail',
  'snake','snare','sneak','sonar','solve','south','space','spare','spark','spawn',
  'speed','spend','spice','spine','spite','spoke','spoon','sport','spray','squad',
  'stack','staff','stage','stain','stale','stand','stare','start','state','steal',
  'steam','steel','steep','steer','stern','stiff','still','sting','stock','stoic',
  'stone','stood','storm','story','stout','stove','strip','strum','stuck','study',
  'stump','style','sugar','suite','sunny','surge','swamp','swear','sweep','sweet',
  'swift','swirl','swoop','spout','spree','snowy','saucy','scone','scour','sedan',
  'shady','shaky','shoal','silky','skate','skimp','slant','sleek','sleet','slick',
  'slimy','sloth','smear','sniff','snore','snort','soggy','solar','sooty','sorry',
  'stalk','stomp','strap','stray','stung','stunt','suave','surly','swung','syrup',
  'sabot','sable','salve','samba','sandy','sappy','sassy','satay','savvy','scald',
  'scaly','scamp','scorn','scowl','scrub','seamy','sedge','seedy','semen','serum',
  'shack','shale','shank','shred','shrub','shrug','shuck','sigma','sinew','skirt',
  'skirm','slack','slake','slang','slier','slosh','smack','smelt','smirk','smoky',
  'snaky','snarl','snide','snoby','snoop','snout','sober','soddy','soppy','sough',
  'souse','spate','spicy','spiky','spill','spiny','spool','spore','sprig','spunk',
  'squab','squat','squid','staid','stank','stark','stash','stead','store','stork',
  'straw','strut','super','suede','sulky','sumac','supra','swath','swipe','swoon',
  'swore','table','talon','tangy','taste','teach','tense','terms','theft','their',
  'theme','there','these','thing','think','those','three','threw','throw','tiger',
  'tipsy','title','toast','token','tolls','tough','tower','toxic','trace','track',
  'trade','trail','train','trait','tramp','trash','trawl','tread','trend','trial',
  'tribe','trick','tried','troll','troop','troth','trove','truck','trunk','trust',
  'truth','tuner','tunic','twirl','twist','taboo','tawny','tonic','taffy','tight',
  'taunt','terse','thorn','today','torso','towel','truce','truly','tryst','tulip',
  'tummy','tutor','twang','thane','tabby','tacit','tango','tapir','tardy','tatty',
  'teary','tempt','tepid','testy','thief','thong','thump','tiara','timid','toffy',
  'toile','topaz','topsy','touch','trice','tripe','trite','trout','trued','trump',
  'truss','tumor','tweak','tween','tweed','tweet','twerp','twill','typed','udder',
  'ultra','unify','union','unite','unity','until','upend','upper','upset','urban',
  'usage','utter','uncut','ulcer','umbra','under','undue','unfit','untie','unwed',
  'unmet','unpin','unset','unsay','vague','valor','value','valve','venue','verse',
  'vigor','viper','viral','vital','vivid','vocal','voice','voter','vault','visor',
  'vapid','venom','vaunt','vexed','video','viola','voles','vomit','vouch','vying',
  'valid','vegan','venal','verge','viand','vicar','vinyl','virgo','vista','vodka',
  'vogue','voila','volga','voley','voile','waken','waltz','waste','watch','water',
  'weary','weave','wedge','weigh','weird','whale','wheat','wheel','where','which',
  'while','whine','whole','whose','wield','windy','witch','woman','women','world',
  'worry','worth','would','wrath','wring','write','wrong','weedy','witty','wispy',
  'wacky','wager','whack','whiff','whirl','wimpy','wince','winch','woozy','wreak',
  'wreck','wrest','white','wagon','wally','warty','washy','waxen','whelp','willy',
  'wooly','wordy','wormy','wound','woken','wonky','woody','woofy','worse','worst',
  'wroth','xenon','yacht','yearn','yield','youth','yummy','yokel','yodel','yeast',
  'yours','yucky','zebra','zilch','zippy','zesty','zonal','zappy','zingy','zloty',
]);

// ============================================================
// SOUND ENGINE
// ============================================================
function _ctx() {
  return audioCtx();
}

function playKey() {
  if (isMuted()) return;
  try {
    const ctx = _ctx(), now = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, now);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.start(now); osc.stop(now + 0.06);
  } catch (_) {}
}

function playReveal(st, delay = 0) {
  if (isMuted()) return;
  try {
    const ctx = _ctx();
    const now = ctx.currentTime + delay;
    const freq = st === 'correct' ? 880 : st === 'present' ? 660 : 350;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.start(now); osc.stop(now + 0.12);
  } catch (_) {}
}

function playShake() {
  if (isMuted()) return;
  try {
    const ctx = _ctx(), now = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.16);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.start(now); osc.stop(now + 0.16);
  } catch (_) {}
}

function playWin() {
  if (isMuted()) return;
  try {
    const ctx = _ctx();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle';
      const t = ctx.currentTime + i * 0.13;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.start(t); osc.stop(t + 0.45);
    });
  } catch (_) {}
}

function playLose() {
  if (isMuted()) return;
  try {
    const ctx = _ctx(), now = ctx.currentTime;
    [400, 280].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = now + i * 0.18;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.35);
    });
  } catch (_) {}
}

function playChime() {
  if (isMuted()) return;
  try {
    const ctx = _ctx(), now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = now + i * 0.12;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.35);
    });
  } catch (_) {}
}

// ============================================================
// FIREBASE
// ============================================================

// ============================================================
// STATE
// ============================================================
const MAX_GUESSES = 6;
let currentGuess  = '';
let animating     = false;

const state = {
  mode:         'local',
  players:      ['Player 1', 'Player 2'],
  words:        [null, null],
  guesses:      [[], []],
  current:      0,
  winner:       null,
  localSetStep: 0,
};

const mp = {
  active:  false,
  started: false,
  myIdx:   0,
  role:    null,
  ref:     null,
  code:    null,
};

// ============================================================
// MESSAGES
// ============================================================
function setMsg(msg, isError = false) {
  const bar = document.getElementById('msg-bar');
  if (!bar) return;
  bar.textContent = msg;
  bar.className   = 'msg-bar' + (isError ? ' error' : '');
}

function setOnlineMsg(msg, isError = false) {
  const el = document.getElementById('online-msg');
  if (!el) return;
  el.textContent  = msg;
  el.style.color  = isError ? '#c0392b' : '';
}

function setSetWordMsg(msg, isError = false) {
  const el = document.getElementById('set-word-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color  = isError ? '#c0392b' : '';
}

// ============================================================
// WORD LOGIC
// ============================================================
function isValid(word) {
  return word.length === 5 && WORDS.has(word.toLowerCase());
}

function evaluate(guess, target) {
  const g      = guess.toLowerCase().split('');
  const t      = target.toLowerCase().split('');
  const result = g.map(letter => ({ letter, state: 'absent' }));
  const pool   = [...t];

  for (let i = 0; i < 5; i++) {
    if (g[i] === t[i]) { result[i].state = 'correct'; pool[i] = null; }
  }
  for (let i = 0; i < 5; i++) {
    if (result[i].state !== 'absent') continue;
    const j = pool.findIndex(l => l === g[i]);
    if (j !== -1) { result[i].state = 'present'; pool[j] = null; }
  }
  return result;
}

// ============================================================
// BOARD
// ============================================================
function buildBoards() {
  for (let p = 0; p < 2; p++) {
    const grid = document.getElementById('board-' + p);
    if (!grid) continue;
    grid.innerHTML = '';
    for (let r = 0; r < MAX_GUESSES; r++) {
      const row = document.createElement('div');
      row.className = 'bw-row';
      row.id        = `row-${p}-${r}`;
      for (let c = 0; c < 5; c++) {
        const tile = document.createElement('div');
        tile.className = 'bw-tile';
        tile.id        = `tile-${p}-${r}-${c}`;
        row.appendChild(tile);
      }
      grid.appendChild(row);
    }
  }
}

function renderBoards(skipPlayer = -1, skipRow = -1) {
  for (let p = 0; p < 2; p++) {
    const oppWord    = state.words[1 - p];
    const showLetters = state.mode === 'local' || p === mp.myIdx;

    for (let r = 0; r < MAX_GUESSES; r++) {
      if (p === skipPlayer && r === skipRow) continue;

      const submitted = r < state.guesses[p].length;
      const isCurrent = r === state.guesses[p].length && p === state.current && state.winner === null;

      for (let c = 0; c < 5; c++) {
        const tile = document.getElementById(`tile-${p}-${r}-${c}`);
        if (!tile) continue;

        if (submitted) {
          const result = oppWord ? evaluate(state.guesses[p][r], oppWord) : null;
          tile.textContent = showLetters ? state.guesses[p][r][c].toUpperCase() : '';
          tile.className   = 'bw-tile filled ' + (result ? result[c].state : '');
        } else if (isCurrent) {
          tile.textContent = c < currentGuess.length ? currentGuess[c].toUpperCase() : '';
          tile.className   = 'bw-tile' + (tile.textContent ? ' typed' : '');
        } else {
          tile.textContent = '';
          tile.className   = 'bw-tile';
        }
      }
    }
  }
}

function animateReveal(playerIdx, rowIdx, results, onDone) {
  const showLetters = state.mode === 'local' || playerIdx === mp.myIdx;

  results.forEach(({ letter, state: st }, c) => {
    const tile  = document.getElementById(`tile-${playerIdx}-${rowIdx}-${c}`);
    const delay = c * 130;

    setTimeout(() => {
      tile.classList.add('flip-in');
      setTimeout(() => {
        tile.textContent = showLetters ? letter.toUpperCase() : '';
        tile.className   = `bw-tile filled ${st} flip-out`;
        playReveal(st);
        setTimeout(() => tile.classList.remove('flip-out'), 220);
      }, 220);
    }, delay);
  });

  setTimeout(onDone, results.length * 130 + 440);
}

function bounceWinRow(playerIdx, rowIdx) {
  for (let c = 0; c < 5; c++) {
    const tile = document.getElementById(`tile-${playerIdx}-${rowIdx}-${c}`);
    if (!tile) continue;
    setTimeout(() => {
      tile.classList.add('bounce');
      tile.addEventListener('animationend', () => tile.classList.remove('bounce'), { once: true });
    }, c * 80);
  }
}

// ============================================================
// BOARD LABELS
// ============================================================
function updateBoardLabels() {
  for (let p = 0; p < 2; p++) {
    const label = document.getElementById('board-label-' + p);
    if (!label) continue;
    if (state.mode === 'online') {
      label.textContent = p === mp.myIdx ? 'Your Guesses' : (state.players[p] || 'Opponent') + "'s";
    } else {
      label.textContent = state.players[p];
    }
  }
}

// ============================================================
// TURN UI
// ============================================================
function updateTurnUI() {
  const label = document.getElementById('turn-label');
  const dot   = document.getElementById('turn-dot');
  const name  = state.players[state.current] || 'Player';

  if (label) label.textContent = name + "'s Turn";
  if (dot)   dot.className     = 'turn-dot p' + state.current;

  const isMyTurn  = state.mode === 'local' || state.current === mp.myIdx;
  const kb        = document.getElementById('game-keyboard');
  if (kb) {
    kb.style.opacity       = isMyTurn ? '1' : '0.4';
    kb.style.pointerEvents = isMyTurn ? '' : 'none';
  }
}

// ============================================================
// KEYBOARD
// ============================================================
function buildKeyboard(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].forEach((row, ri) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'bw-key-row';

    if (ri === 2) rowEl.appendChild(makeKey('Enter', 'Enter', 'bw-key bw-key-wide'));

    for (const ch of row) rowEl.appendChild(makeKey(ch, ch.toUpperCase(), 'bw-key'));

    if (ri === 2) rowEl.appendChild(makeKey('Backspace', '⌫', 'bw-key bw-key-wide'));

    container.appendChild(rowEl);
  });
}

function makeKey(key, label, cls) {
  const btn     = document.createElement('button');
  btn.className = cls;
  btn.textContent = label;
  btn.dataset.key = key;
  btn.addEventListener('click', () => handleKey(key));
  return btn;
}

function updateKeyboard(containerId, playerIdx) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const ks = getKeyStates(playerIdx);
  container.querySelectorAll('.bw-key').forEach(btn => {
    const k = btn.dataset.key;
    if (k && k.length === 1) btn.className = 'bw-key' + (ks[k] ? ' ' + ks[k] : '');
  });
}

function getKeyStates(playerIdx) {
  const ks       = {};
  const priority = { correct: 3, present: 2, absent: 1 };
  const oppWord  = state.words[1 - playerIdx];
  if (!oppWord) return ks;

  for (const guess of state.guesses[playerIdx]) {
    for (const { letter, state: s } of evaluate(guess, oppWord)) {
      if (!ks[letter] || priority[s] > priority[ks[letter]]) ks[letter] = s;
    }
  }
  return ks;
}

// ============================================================
// SET-WORD TILES
// ============================================================
let setWordBuffer = '';

function buildSetWordTiles() {
  const row = document.getElementById('set-word-row');
  if (!row) return;
  row.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const tile     = document.createElement('div');
    tile.className = 'bw-tile bw-tile-lg';
    tile.id        = 'sw-tile-' + i;
    row.appendChild(tile);
  }
}

function updateSetWordTiles(word) {
  for (let i = 0; i < 5; i++) {
    const tile = document.getElementById('sw-tile-' + i);
    if (!tile) continue;
    tile.textContent = i < word.length ? word[i].toUpperCase() : '';
    tile.className   = 'bw-tile bw-tile-lg' + (tile.textContent ? ' typed' : '');
  }
}

function shakeSetWordRow() {
  const row = document.getElementById('set-word-row');
  if (!row) return;
  row.classList.add('shake');
  row.addEventListener('animationend', () => row.classList.remove('shake'), { once: true });
}

// ============================================================
// INPUT ROUTING
// ============================================================
function handleKey(key) {
  const active = document.querySelector('.screen.active');
  if (!active) return;
  if (active.id === 'screen-set-word') handleSetWordKey(key);
  else if (active.id === 'screen-game') handleGameKey(key);
}

function handleSetWordKey(key) {
  if (key === 'Backspace') {
    if (setWordBuffer.length > 0) {
      setWordBuffer = setWordBuffer.slice(0, -1);
      updateSetWordTiles(setWordBuffer);
    }
  } else if (key === 'Enter') {
    confirmWord();
  } else if (/^[a-zA-Z]$/.test(key) && setWordBuffer.length < 5) {
    setWordBuffer += key.toLowerCase();
    updateSetWordTiles(setWordBuffer);
    playKey();
  }
}

function handleGameKey(key) {
  if (state.winner !== null || animating) return;
  if (state.mode === 'online' && state.current !== mp.myIdx) return;
  if (state.guesses[state.current].length >= MAX_GUESSES) return;

  if (key === 'Backspace') {
    if (currentGuess.length > 0) { currentGuess = currentGuess.slice(0, -1); renderBoards(); }
  } else if (key === 'Enter') {
    submitGuess();
  } else if (/^[a-zA-Z]$/.test(key) && currentGuess.length < 5) {
    currentGuess += key.toLowerCase();
    renderBoards();
    playKey();
  }
}

// ============================================================
// GUESS SUBMISSION
// ============================================================
function submitGuess() {
  const p       = state.current;
  const oppWord = state.words[1 - p];
  const rowIdx  = state.guesses[p].length;

  if (currentGuess.length < 5) {
    shakeRow(p, rowIdx);
    setMsg('Not enough letters', true);
    playShake();
    return;
  }
  if (!isValid(currentGuess)) {
    shakeRow(p, rowIdx);
    setMsg('Not in word list', true);
    playShake();
    return;
  }

  const results = evaluate(currentGuess, oppWord);
  state.guesses[p].push(currentGuess);
  currentGuess = '';
  animating    = true;

  // Sync guesses immediately for online watchers
  if (state.mode === 'online') {
    mp.ref.update({ [`p${p}Guesses`]: state.guesses[p] });
  }

  animateReveal(p, rowIdx, results, () => {
    animating = false;
    updateKeyboard('game-keyboard', p);

    const won   = results.every(r => r.state === 'correct');
    const myOut = state.guesses[p].length >= MAX_GUESSES;

    if (won) {
      bounceWinRow(p, rowIdx);
      playWin();
      state.winner = p;
      if (state.mode === 'online') {
        mp.ref.update({ winner: p, status: 'done', p0Guesses: state.guesses[0], p1Guesses: state.guesses[1] });
      }
      setTimeout(() => showWinScreen(p), 900);
      return;
    }

    if (myOut) {
      setMsg(`${state.players[p]}: no guesses left — the word was ${state.words[1 - p].toUpperCase()}`, false);
      const other    = 1 - p;
      const otherOut = state.guesses[other].length >= MAX_GUESSES;
      if (otherOut) {
        state.winner = 'draw';
        playLose();
        if (state.mode === 'online') mp.ref.update({ winner: 2, status: 'done' });
        setTimeout(() => showWinScreen('draw'), 1600);
      } else {
        setTimeout(() => {
          state.current = other;
          updateTurnUI();
          updateBoardLabels();
          renderBoards();
          updateKeyboard('game-keyboard', other);
          setMsg(`${state.players[other]}'s turn`);
          if (state.mode === 'online') syncToFirebase();
        }, 1600);
      }
      return;
    }

    // Normal turn switch
    const next = 1 - p;
    if (state.guesses[next].length >= MAX_GUESSES) {
      // next player already exhausted their guesses too → draw
      state.winner = 'draw';
      playLose();
      if (state.mode === 'online') mp.ref.update({ winner: 2, status: 'done' });
      setTimeout(() => showWinScreen('draw'), 500);
      return;
    }

    state.current = next;
    updateTurnUI();
    renderBoards();
    updateKeyboard('game-keyboard', next);
    setMsg(state.mode === 'online' && next === mp.myIdx ? 'Your turn!' : `${state.players[next]}'s turn`);
    if (state.mode === 'online') syncToFirebase();
  });

  // Render boards but skip the row being animated
  renderBoards(p, rowIdx);
}

function shakeRow(playerIdx, rowIdx) {
  const row = document.getElementById(`row-${playerIdx}-${rowIdx}`);
  if (!row) return;
  row.classList.remove('shake');
  void row.offsetWidth;
  row.classList.add('shake');
  row.addEventListener('animationend', () => row.classList.remove('shake'), { once: true });
}

// ============================================================
// GAME SETUP
// ============================================================
function startGame() {
  currentGuess = '';
  animating    = false;
  buildBoards();
  buildKeyboard('game-keyboard');
  updateBoardLabels();
  updateTurnUI();
  updateKeyboard('game-keyboard', state.current);
  renderBoards();
  setMsg(state.mode === 'online' && state.current === mp.myIdx
    ? 'Your turn!'
    : `${state.players[state.current]}'s turn`);
  showScreen('game');
}

// ============================================================
// LOCAL FLOW
// ============================================================
function startLocalFlow() {
  const p1 = document.getElementById('local-name-0').value.trim() || 'Player 1';
  const p2 = document.getElementById('local-name-1').value.trim() || 'Player 2';
  lvsSaveNames(p1, p2);
  state.mode         = 'local';
  state.players      = [p1, p2];
  state.words        = [null, null];
  state.guesses      = [[], []];
  state.winner       = null;
  state.current      = Math.random() < 0.5 ? 0 : 1;
  state.localSetStep = 0;
  showSetWordScreen(0);
}

function showSetWordScreen(playerIdx) {
  setWordBuffer = '';
  buildSetWordTiles();
  updateSetWordTiles('');
  setSetWordMsg('');

  const header = document.getElementById('set-word-header');
  const sub    = document.getElementById('set-word-sub');
  const btn    = document.getElementById('confirm-word-btn');
  const ind    = document.getElementById('set-word-indicator');

  if (header) header.textContent = state.players[playerIdx] + ', set your secret word';
  if (sub)    sub.textContent    = 'Enter any valid 5-letter word — your opponent will try to guess it.';
  if (btn)    { btn.disabled = false; btn.textContent = 'Confirm Word →'; }
  if (ind)    { ind.textContent = state.players[playerIdx]; }

  buildKeyboard('set-word-keyboard');
  showScreen('set-word');
}

function confirmWord() {
  if (setWordBuffer.length < 5) { setSetWordMsg('Word must be 5 letters', true); return; }
  if (!isValid(setWordBuffer))  { setSetWordMsg('Not a valid word — try another', true); shakeSetWordRow(); playShake(); return; }

  if (state.mode === 'online') { confirmOnlineWord(); return; }

  // Local
  if (state.localSetStep === 0) {
    state.words[0]     = setWordBuffer;
    state.localSetStep = 1;
    const coverText = document.getElementById('cover-text');
    const coverBtn  = document.getElementById('cover-btn');
    if (coverText) coverText.textContent = `Word locked! Hand the device to ${state.players[1]}`;
    if (coverBtn)  coverBtn.textContent  = `I'm ${state.players[1]}, Ready →`;
    showScreen('cover');
  } else {
    state.words[1] = setWordBuffer;
    startGame();
  }
}

function coverReady() {
  state.localSetStep = 2;
  showSetWordScreen(1);
}

// ============================================================
// ONLINE FLOW
// ============================================================

function createRoom() {
  if (mp.ref) { mp.ref.off(); mp.ref = null; }
  const name    = document.getElementById('online-name').value.trim() || 'Player';
  lvsSaveNames(name, null);
  const code    = randomCode();
  const hostIdx = Math.floor(Math.random() * 2);
  const ref     = db.ref('battleword-rooms/' + code);

  mp.active  = true;
  mp.started = false;
  mp.role    = 'host';
  mp.myIdx   = hostIdx;
  mp.ref     = ref;
  mp.code    = code;

  state.mode         = 'online';
  state.players      = ['', ''];
  state.players[hostIdx] = name;

  ref.set({
    host:      name,
    guest:     null,
    hostIdx,
    status:    'waiting',
    p0Word:    null,
    p1Word:    null,
    p0Ready:   false,
    p1Ready:   false,
    p0Guesses: [],
    p1Guesses: [],
    current:   0,
    winner:    -1,
  });

  localStorage.setItem('lvs_bw_room', code);
  localStorage.setItem('lvs_bw_role', 'host');

  document.getElementById('waiting-code').textContent = code;
  document.getElementById('waiting-copy-btn').textContent = 'Copy Link';
  showScreen('waiting');

  ref.on('value', snap => {
    const d = snap.val();
    if (!d) return;

    // Guest joined → move to word-setting
    if (d.status === 'setting' && !mp.started) {
      mp.started      = true;
      state.players[1 - hostIdx] = d.guest || 'Opponent';
      playChime();
      startOnlineWordSetting(d);
      return;
    }

    // Rematch: both reset, not yet on set-word screen
    if (d.status === 'setting' && mp.started && !d.p0Ready && !d.p1Ready && d.winner === -1) {
      if (!document.getElementById('screen-set-word').classList.contains('active')) {
        state.words = [null, null]; state.guesses = [[], []]; state.winner = null;
        currentGuess = ''; animating = false;
        startOnlineWordSetting(d);
      }
      return;
    }

    // Both set words → start game
    if (d.status === 'setting' && d.p0Ready && d.p1Ready) {
      ref.update({ status: 'playing', current: d.hostIdx });
    }

    if (d.status === 'playing') {
      if (!document.getElementById('screen-game').classList.contains('active')) {
        loadOnlineGame(d);
      } else {
        handleOnlineUpdate(d);
      }
    }

    if (d.status === 'done' || (d.winner !== undefined && d.winner !== -1)) {
      handleOnlineUpdate(d);
    }
  });
}

function joinRoom() {
  const name = document.getElementById('online-name').value.trim() || 'Player';
  lvsSaveNames(name, null);
  const code = document.getElementById('join-code').value.trim().toUpperCase();

  if (code.length < 4) { setOnlineMsg('Enter a 4-letter room code', true); return; }
  setOnlineMsg('Joining…');

  db.ref('battleword-rooms/' + code).once('value', snap => {
    const data = snap.val();
    if (!data || data.status !== 'waiting') { setOnlineMsg('Room not found — check the code', true); return; }

    const ref = db.ref('battleword-rooms/' + code);
    mp.active  = true;
    mp.started = true;
    mp.role    = 'guest';
    mp.myIdx   = 1 - data.hostIdx;
    mp.ref     = ref;
    mp.code    = code;

    state.mode    = 'online';
    state.players = ['', ''];
    state.players[data.hostIdx]     = data.host;
    state.players[1 - data.hostIdx] = name;

    ref.update({ guest: name, status: 'setting' });

    localStorage.setItem('lvs_bw_room', code);
    localStorage.setItem('lvs_bw_role', 'guest');

    playChime();
    startOnlineWordSetting(data);

    ref.on('value', snap => {
      const d = snap.val();
      if (!d) return;

      // Rematch: both reset, not yet on set-word screen
      if (d.status === 'setting' && !d.p0Ready && !d.p1Ready && d.winner === -1) {
        if (!document.getElementById('screen-set-word').classList.contains('active')) {
          state.words = [null, null]; state.guesses = [[], []]; state.winner = null;
          currentGuess = ''; animating = false;
          startOnlineWordSetting(d);
        }
        return;
      }
      if (d.status === 'setting' && d.p0Ready && d.p1Ready) {
        ref.update({ status: 'playing', current: d.hostIdx });
      }
      if (d.status === 'playing') {
        if (!document.getElementById('screen-game').classList.contains('active')) {
          loadOnlineGame(d);
        } else {
          handleOnlineUpdate(d);
        }
      }
      if (d.status === 'done' || (d.winner !== undefined && d.winner !== -1)) {
        handleOnlineUpdate(d);
      }
    });
  });
}

function startOnlineWordSetting(data) {
  lvsOnlineStart(mp.ref, mp.myIdx, backToLobby);
  if (data.guest) state.players[1 - data.hostIdx] = data.guest;

  setWordBuffer = '';
  buildSetWordTiles();
  updateSetWordTiles('');
  setSetWordMsg('');

  const header = document.getElementById('set-word-header');
  const sub    = document.getElementById('set-word-sub');
  const btn    = document.getElementById('confirm-word-btn');
  const ind    = document.getElementById('set-word-indicator');

  if (header) header.textContent = 'Set Your Secret Word';
  if (sub)    sub.textContent    = 'Enter any valid 5-letter word — your opponent will try to guess it.';
  if (btn)    { btn.disabled = false; btn.textContent = 'Confirm Word →'; }
  if (ind)    ind.textContent = 'Your word';

  buildKeyboard('set-word-keyboard');
  showScreen('set-word');
}

function confirmOnlineWord() {
  const wordKey  = `p${mp.myIdx}Word`;
  const readyKey = `p${mp.myIdx}Ready`;

  mp.ref.update({ [wordKey]: setWordBuffer, [readyKey]: true });

  setSetWordMsg('Word locked! Waiting for opponent…');

  const kb = document.getElementById('set-word-keyboard');
  if (kb) { kb.style.opacity = '0.4'; kb.style.pointerEvents = 'none'; }

  const btn = document.getElementById('confirm-word-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Waiting…'; }
}

function loadOnlineGame(data) {
  state.words   = [data.p0Word, data.p1Word];
  state.guesses = [data.p0Guesses || [], data.p1Guesses || []];
  state.current = data.current;
  state.winner  = data.winner === -1 ? null : (data.winner === 2 ? 'draw' : data.winner);

  state.players = ['', ''];
  state.players[data.hostIdx]     = data.host;
  state.players[1 - data.hostIdx] = data.guest || '…';

  if (!document.getElementById('screen-game').classList.contains('active')) {
    startGame();
  } else {
    renderBoards();
    updateBoardLabels();
    updateTurnUI();
    updateKeyboard('game-keyboard', state.current);
    setMsg(state.current === mp.myIdx ? 'Your turn!' : `${state.players[state.current]}'s turn`);
  }
}

function handleOnlineUpdate(d) {
  lvsOnlineUpdate(d);
  if (d.ready0 === true && d.ready1 === true && mp.role === 'host') {
    mp.ref.update({
      status:    'setting',
      p0Word:    null,
      p1Word:    null,
      p0Ready:   false,
      p1Ready:   false,
      p0Guesses: [],
      p1Guesses: [],
      winner:    -1,
      ready0:    false,
      ready1:    false,
    });
    startOnlineWordSetting({ hostIdx: mp.role === 'host' ? mp.myIdx : 1 - mp.myIdx });
    return;
  }
  if (animating) return;

  const prevTotal = state.guesses[0].length + state.guesses[1].length;
  state.words   = [d.p0Word, d.p1Word];
  state.guesses = [d.p0Guesses || [], d.p1Guesses || []];
  state.current = d.current;

  if (d.winner !== undefined && d.winner !== -1) {
    state.winner = d.winner === 2 ? 'draw' : d.winner;
  }

  if (!document.getElementById('screen-game').classList.contains('active')) {
    if (d.status === 'playing') loadOnlineGame(d);
    return;
  }

  renderBoards();
  updateBoardLabels();
  updateTurnUI();
  updateKeyboard('game-keyboard', state.current);

  if (state.winner !== null) {
    setTimeout(() => showWinScreen(state.winner), 400);
    return;
  }

  setMsg(state.current === mp.myIdx ? 'Your turn!' : `${state.players[state.current]}'s turn`);
}

function syncToFirebase() {
  if (!mp.active || !mp.ref) return;
  mp.ref.update({
    p0Guesses: state.guesses[0],
    p1Guesses: state.guesses[1],
    current:   state.current,
    winner:    state.winner === null ? -1 : (state.winner === 'draw' ? 2 : state.winner),
    status:    state.winner !== null ? 'done' : 'playing',
  });
}

// ============================================================
// WIN SCREEN
// ============================================================
function showWinScreen(winner) {
  const winName   = document.getElementById('win-name');
  const winSub    = document.getElementById('win-sub');
  const winWord0  = document.getElementById('win-word-0');
  const winWord1  = document.getElementById('win-word-1');
  const winLabel0 = document.getElementById('win-word-label-0');
  const winLabel1 = document.getElementById('win-word-label-1');

  if (winLabel0) winLabel0.textContent = state.players[0] + "'s word";
  if (winLabel1) winLabel1.textContent = state.players[1] + "'s word";
  if (winWord0)  winWord0.textContent  = (state.words[0] || '?????').toUpperCase();
  if (winWord1)  winWord1.textContent  = (state.words[1] || '?????').toUpperCase();

  if (winner === 'draw') {
    if (winName) winName.textContent = 'Draw!';
    if (winSub)  winSub.textContent  = 'Both players ran out of guesses';
  } else {
    if (winName) winName.textContent = state.players[winner] + ' wins!';
    const n = state.guesses[winner].length;
    if (winSub)  winSub.textContent  = `Cracked it in ${n} ${n === 1 ? 'guess' : 'guesses'}`;
  }

  window._lvsWinPlayers = { names: state.players.slice(), winner: winner === 'draw' ? 2 : winner };
  showScreen('win');
  if (winner !== 'draw') setTimeout(launchConfetti, 100);
}
// ============================================================
// BACK / PLAY AGAIN
// ============================================================
function backToLobby() {
  lvsOnlineStop();
  if (mp.active && mp.ref) { mp.ref.off(); }
  mp.active  = false;
  mp.started = false;
  mp.ref     = null;
  mp.code    = null;
  localStorage.removeItem('lvs_bw_room');
  localStorage.removeItem('lvs_bw_role');
  state.words   = [null, null];
  state.guesses = [[], []];
  state.winner  = null;
  currentGuess  = '';
  animating     = false;
  showScreen('lobby');
}

function playAgain() {
  if (state.mode === 'local') {
    state.words   = [null, null];
    state.guesses = [[], []];
    state.winner  = null;
    state.localSetStep = 0;
    showSetWordScreen(0);
  } else {
    const btn = document.getElementById('win-again-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Ready! Waiting\u2026'; }
    mp.ref.update({ ['ready' + mp.myIdx]: true });
  }
}

function copyCode() {
  const btn = document.getElementById('waiting-copy-btn');
  lvsCopyLink(mp.code, btn, 'Copy Link');
}

// ============================================================
// KEYBOARD LISTENER
// ============================================================
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Backspace') { e.preventDefault(); handleKey('Backspace'); }
  else if (e.key === 'Enter') { e.preventDefault(); handleKey('Enter'); }
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key);
});

// ============================================================
// RECONNECT ON REFRESH
// ============================================================
(function tryReconnect() {
  const code = localStorage.getItem('lvs_bw_room');
  const role = localStorage.getItem('lvs_bw_role');
  if (!code || !role) return;

  db.ref('battleword-rooms/' + code).once('value', snap => {
    const data = snap.val();
    if (!data || data.status === 'waiting' || data.status === 'done') {
      localStorage.removeItem('lvs_bw_room');
      localStorage.removeItem('lvs_bw_role');
      return;
    }

    const ref = db.ref('battleword-rooms/' + code);
    mp.active  = true;
    mp.started = true;
    mp.role    = role;
    mp.myIdx   = role === 'host' ? data.hostIdx : 1 - data.hostIdx;
    mp.ref     = ref;
    mp.code    = code;
    state.mode = 'online';

    state.players = ['', ''];
    state.players[data.hostIdx]     = data.host;
    state.players[1 - data.hostIdx] = data.guest || '…';

    lvsOnlineStart(ref, mp.myIdx, backToLobby);

    if (data.status === 'setting') {
      startOnlineWordSetting(data);
    } else {
      loadOnlineGame(data);
    }

    ref.on('value', snap => {
      const d = snap.val();
      if (!d) return;

      if (d.status === 'setting') {
        // Rematch reset — return to word-setting screen
        if (!d.p0Ready && !d.p1Ready && d.winner === -1) {
          if (!document.getElementById('screen-set-word').classList.contains('active')) {
            state.words = [null, null]; state.guesses = [[], []]; state.winner = null;
            currentGuess = ''; animating = false;
            startOnlineWordSetting(d);
          }
          return;
        }
        // Both words locked — host transitions to playing
        if (d.p0Ready && d.p1Ready && mp.role === 'host') {
          ref.update({ status: 'playing', current: d.hostIdx });
        }
        return;
      }

      if (d.status === 'playing') {
        if (!document.getElementById('screen-game').classList.contains('active')) loadOnlineGame(d);
        else handleOnlineUpdate(d);
      }
      if (d.status === 'done' || (d.winner !== undefined && d.winner !== -1)) handleOnlineUpdate(d);
    });
  });
})();
