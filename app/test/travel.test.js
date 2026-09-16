const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TRAVEL_STATUSES,
  emptyTravelState,
  normalizeTravelPreferences,
  emptyTrip,
  normalizeDestinationCandidate,
  destinationScore,
  travelSummary,
  destinationResearchCompleteness,
  compareDestinations,
  destinationResearchBrief,
  automatedDestinationResearch,
  tripLengthDays,
  travelProviderStatus,
  normalizeLiveResearchSnapshot,
  liveResearchFreshness,
  applyLiveResearchSnapshot,
  flightAtlasScore,
  normalizeFlightOption,
  compareFlights,
  resortAtlasScore,
  normalizeResortOption,
  compareResorts,
  packageAtlasScore,
  optimizeTripPackages,
  normalizeBookingDecision,
  bookingDecisionState,
  updateBookingDecision,
  bookPreferredPackage,
  normalizeTripOperations,
  tripOperationsState,
  updateTripOperations,
  startTripTraveling,
  normalizePreDeparture,
  preDepartureState,
  updatePreDeparture,
  normalizeLiveTrip,
  liveTripState,
  updateLiveTrip,
  normalizeTripResilience,
  tripResilienceState,
  updateTripResilience,
  normalizeTripWrapUp,
  tripWrapUpState,
  updateTripWrapUp,
  normalizeTripReview,
  tripReviewState,
  updateTripReview,
  completeTripReview,
  applyTripLearning,
  travelIntelligenceDashboard,
  normalizeTripScenario,
  compareTripScenarios,
  normalizeScenarioWatch,
  travelWatchlistState,
  addScenarioWatch,
  updateScenarioWatch,
  recordScenarioWatchCheck,
  travelActionQueue,
  updateTravelAction,
  travelBookingReadinessCenter,
  bookingExecutionState,
  startBookingExecution,
  updateBookingExecution,
  finalizeBookingExecution
} = require('../travel');

test('Travel Build 1 exposes the intended trip lifecycle', () => {
  assert.deepEqual(TRAVEL_STATUSES, ['Dreaming', 'Researching', 'Planning', 'Booked', 'Traveling', 'Completed']);
});

test('empty travel state includes durable preferences and trips', () => {
  const state = emptyTravelState();
  assert.equal(state.schema_version, 1);
  assert.equal(state.preferences.home_airport, 'MSP');
  assert.deepEqual(state.trips, []);
});

test('preference normalization preserves defaults and custom values', () => {
  const prefs = normalizeTravelPreferences({
    home_airport: 'msp',
    default_party_size: 2,
    preferred_max_flight_hours: 5,
    preferences: { all_inclusive: true, beach: true },
    avoid_destinations: ['Punta Cana', 'Punta Cana']
  });
  assert.equal(prefs.home_airport, 'MSP');
  assert.equal(prefs.preferred_max_flight_hours, 5);
  assert.equal(prefs.preferences.all_inclusive, true);
  assert.equal(prefs.preferences.beach, true);
  assert.deepEqual(prefs.avoid_destinations, ['Punta Cana']);
});

test('destination scoring rewards budget fit and user preferences', () => {
  const prefs = normalizeTravelPreferences({
    preferences: { all_inclusive: true, beach: true, relaxation: true },
    preferred_max_flight_hours: 6
  });
  const trip = emptyTrip({ name: 'Winter escape', budget: { target: 5000 } }, prefs);
  const strong = destinationScore({
    name: 'Strong option', estimated_total_cost: 4500, flight_hours: 4.5, layovers: 0,
    weather_score: 9, lodging_fit_score: 9, experience_fit_score: 9, simplicity_score: 9,
    traits: { all_inclusive: true, beach: true, relaxation: true }
  }, prefs, trip);
  const weak = destinationScore({
    name: 'Weak option', estimated_total_cost: 7000, flight_hours: 11, layovers: 2,
    weather_score: 5, lodging_fit_score: 4, experience_fit_score: 5, simplicity_score: 3,
    traits: { all_inclusive: false, beach: false, relaxation: false }
  }, prefs, trip);
  assert.ok(strong.atlas_fit > weak.atlas_fit);
  assert.ok(strong.atlas_fit >= 80);
  assert.ok(weak.warnings.length >= 2);
});

test('avoid list caps Atlas fit and records a warning', () => {
  const prefs = normalizeTravelPreferences({ avoid_destinations: ['Punta Cana'] });
  const score = destinationScore({ name: 'Punta Cana, Dominican Republic', estimated_total_cost: 3000, weather_score: 10, lodging_fit_score: 10, experience_fit_score: 10, simplicity_score: 10 }, prefs, { budget: { target: 5000 } });
  assert.ok(score.atlas_fit <= 40);
  assert.match(score.warnings.join(' '), /avoid list/i);
});

test('candidate normalization stores an explainable score', () => {
  const prefs = normalizeTravelPreferences();
  const trip = emptyTrip({ name: 'Scotland', budget: { target: 5000 } }, prefs);
  const candidate = normalizeDestinationCandidate({ name: 'Edinburgh', country: 'Scotland', estimated_total_cost: 4200, flight_hours: 8, weather_score: 6 }, prefs, trip);
  assert.ok(candidate.id);
  assert.equal(candidate.name, 'Edinburgh');
  assert.equal(typeof candidate.score.atlas_fit, 'number');
  assert.equal(typeof candidate.score.components.budget_fit, 'number');
});

test('travel summary counts lifecycle states and upcoming trip', () => {
  const prefs = normalizeTravelPreferences();
  const a = emptyTrip({ name: 'A', status: 'Planning', dates: { start: '2027-01-10' } }, prefs);
  const b = emptyTrip({ name: 'B', status: 'Completed', dates: { start: '2026-01-10' } }, prefs);
  const summary = travelSummary({ preferences: prefs, trips: [a, b] });
  assert.equal(summary.trip_count, 2);
  assert.equal(summary.active_trip_count, 1);
  assert.equal(summary.status_counts.Planning, 1);
  assert.equal(summary.upcoming_trip.name, 'A');
});

test('Travel Build 1 UI mounts the Trip Command Center', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(html, /ATLAS TRAVEL/);
  assert.match(html, /Trip Command Center/);
  assert.match(js, /\/api\/travel/);
  assert.match(js, /loadTravel/);
});


test('Travel Build 2 measures destination research completeness', () => {
  const complete = destinationResearchCompleteness({ name:'Jamaica', estimated_total_cost:4500, flight_hours:4.5, weather_score:9, lodging_fit_score:9, experience_fit_score:9, simplicity_score:8, traits:{beach:true} });
  const thin = destinationResearchCompleteness({ name:'Jamaica' });
  assert.equal(complete, 100);
  assert.ok(thin < complete);
});

test('Travel Build 2 comparison ranks candidates and exposes budget deltas', () => {
  const prefs = normalizeTravelPreferences({ preferences:{beach:true, relaxation:true} });
  const trip = emptyTrip({ name:'Winter escape', budget:{target:5000} }, prefs);
  trip.destination_candidates = [
    normalizeDestinationCandidate({ name:'Jamaica', estimated_total_cost:4400, flight_hours:4.5, weather_score:9, lodging_fit_score:9, experience_fit_score:9, simplicity_score:8, traits:{beach:true,relaxation:true} }, prefs, trip),
    normalizeDestinationCandidate({ name:'Far option', estimated_total_cost:6500, flight_hours:10, layovers:2, weather_score:6, lodging_fit_score:6, experience_fit_score:7, simplicity_score:4, traits:{beach:true} }, prefs, trip)
  ];
  const comparison = compareDestinations(trip, prefs);
  assert.equal(comparison.candidate_count, 2);
  assert.equal(comparison.candidates[0].name, 'Jamaica');
  assert.equal(comparison.candidates[0].budget_delta, -600);
  assert.ok(comparison.score_gap > 0);
});

test('Travel Build 2 research brief identifies leader and next research', () => {
  const prefs = normalizeTravelPreferences();
  const trip = emptyTrip({ name:'Test', budget:{target:5000} }, prefs);
  trip.destination_candidates = [normalizeDestinationCandidate({ name:'Curacao', estimated_total_cost:4800, flight_hours:6, weather_score:9, lodging_fit_score:8, experience_fit_score:8, simplicity_score:7, traits:{beach:true} }, prefs, trip)];
  const brief = destinationResearchBrief(trip, prefs);
  assert.match(brief.headline, /Curacao/);
  assert.equal(typeof brief.recommendation, 'string');
  assert.ok(Array.isArray(brief.next_research));
});

test('Travel Build 2 UI mounts destination research workspace', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(html, /Destination Research Workspace/);
  assert.match(html, /travel-destination-form/);
  assert.match(js, /travel-comparison-board/);
  assert.match(server, /travelCompareMatch/);
  assert.match(server, /travelDestinationItemMatch/);
});


test('Travel Build 3 calculates trip length for automated research', () => {
  assert.equal(tripLengthDays({ dates:{ start:'2027-02-01', end:'2027-02-07' } }), 7);
});

test('Travel Build 3 generates ranked seed candidates without claiming live data', () => {
  const prefs = normalizeTravelPreferences({ preferences:{ all_inclusive:true, beach:true, relaxation:true }, avoid_destinations:['Punta Cana'] });
  const trip = emptyTrip({ name:'Winter escape', travelers:2, dates:{start:'2027-02-01',end:'2027-02-07'}, budget:{target:5000} }, prefs);
  const research = automatedDestinationResearch(trip, prefs, { limit:6 });
  assert.equal(research.live_data, false);
  assert.equal(research.candidates.length, 6);
  assert.equal(research.candidates[0].source, 'Atlas seed research');
  assert.equal(research.candidates[0].research_type, 'seed_estimate');
  assert.ok(research.candidates[0].score.atlas_fit >= research.candidates[1].score.atlas_fit);
  assert.match(research.note, /verify live/i);
});

test('Travel Build 3 UI and API expose automated destination research', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Automated destination research/);
  assert.match(html,/travel-auto-research/);
  assert.match(js,/replace_seeded:true/);
  assert.match(server,/travelResearchGenerateMatch/);
  assert.match(server,/automatedDestinationResearch/);
});


test('Travel Build 4 provider registry never claims unconfigured providers are live', () => {
  const status = travelProviderStatus({});
  assert.equal(status.total_count, 4);
  assert.equal(status.ready_count, 0);
  assert.equal(status.live_research_ready, false);
  assert.ok(status.providers.every(item => item.status === 'not_connected'));
});

test('Travel Build 4 provider registry marks provider ready only with name and key', () => {
  const status = travelProviderStatus({ ATLAS_TRAVEL_FLIGHTS_PROVIDER:'Example Flights', ATLAS_TRAVEL_FLIGHTS_API_KEY:'secret' });
  assert.equal(status.ready_count, 1);
  assert.equal(status.providers.find(item => item.kind === 'flights').status, 'ready');
  assert.equal(status.providers.find(item => item.kind === 'lodging').status, 'not_connected');
});

test('Travel Build 4 normalizes provider snapshots and calculates freshness', () => {
  const now = Date.parse('2026-09-13T19:00:00.000Z');
  const snapshot = normalizeLiveResearchSnapshot({ provider:'Example', total_cost:4700, flight_total:900, captured_at:'2026-09-13T18:00:00.000Z', weather_score:9 });
  assert.equal(snapshot.live_data, true);
  assert.equal(snapshot.total_cost, 4700);
  assert.equal(snapshot.weather_score, 9);
  assert.equal(liveResearchFreshness(snapshot, now).label, 'fresh');
});

test('Travel Build 4 applies a verified snapshot and rescoring replaces the seed estimate', () => {
  const prefs = normalizeTravelPreferences({ preferences:{beach:true, relaxation:true} });
  const trip = emptyTrip({ name:'Winter', budget:{target:5000} }, prefs);
  const seed = normalizeDestinationCandidate({ name:'Jamaica', estimated_total_cost:4200, flight_hours:4.5, weather_score:8, lodging_fit_score:9, experience_fit_score:9, simplicity_score:8, traits:{beach:true,relaxation:true}, source:'Atlas seed research', research_type:'seed_estimate' }, prefs, trip);
  const updated = applyLiveResearchSnapshot(seed, { provider:'Verified Travel API', total_cost:4800, flight_hours:5, layovers:1, weather_score:9, availability:'Available', captured_at:new Date().toISOString() }, prefs, trip);
  assert.equal(updated.estimated_total_cost, 4800);
  assert.equal(updated.research_type, 'live_snapshot');
  assert.equal(updated.live_data, true);
  assert.equal(updated.source, 'Verified Travel API');
  assert.equal(updated.live_research.availability, 'Available');
  assert.equal(typeof updated.score.atlas_fit, 'number');
});

test('Travel Build 4 UI and API expose provider readiness and live enrichment', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Live research connections/);
  assert.match(html,/travel-live-snapshot-form/);
  assert.match(js,/\/api\/travel\/providers/);
  assert.match(js,/live-research/);
  assert.match(server,/travelProviderStatus/);
  assert.match(server,/travelLiveResearchMatch/);
});


test('Travel Build 5 scores nonstop lower-cost flights above expensive multi-stop options', () => {
  const prefs = normalizeTravelPreferences({ preferred_max_flight_hours: 7 });
  const trip = emptyTrip({ name:'Jamaica', travelers:2, budget:{target:5000} }, prefs);
  const strong = flightAtlasScore({ total_price:950, total_travel_hours:5, layovers:0, bags_included:true, changeable:true }, prefs, trip);
  const weak = flightAtlasScore({ total_price:1650, total_travel_hours:12, layovers:2, baggage_fees:200 }, prefs, trip);
  assert.ok(strong.atlas_flight_score > weak.atlas_flight_score);
});

test('Travel Build 5 normalizes fee-inclusive flight records and preserves price history', () => {
  const prefs=normalizeTravelPreferences(); const trip=emptyTrip({name:'Trip'},prefs);
  const flight=normalizeFlightOption({destination_airport:'MBJ',airline:'Example Air',base_fare:800,taxes_fees:100,baggage_fees:50,total_travel_hours:5,layovers:0,captured_at:'2026-09-13T20:00:00Z',source:'Example'},prefs,trip);
  assert.equal(flight.total_price,950);
  assert.equal(flight.price_history.length,1);
  assert.equal(typeof flight.score.atlas_flight_score,'number');
});

test('Travel Build 5 flight comparison ranks options and filters by destination', () => {
  const prefs=normalizeTravelPreferences(); const trip=emptyTrip({name:'Trip',budget:{target:5000}},prefs);
  trip.flight_options=[
    normalizeFlightOption({destination_id:'jamaica',destination_airport:'MBJ',total_price:900,total_travel_hours:5,layovers:0},prefs,trip),
    normalizeFlightOption({destination_id:'jamaica',destination_airport:'MBJ',total_price:1300,total_travel_hours:9,layovers:1},prefs,trip),
    normalizeFlightOption({destination_id:'curacao',destination_airport:'CUR',total_price:850,total_travel_hours:8,layovers:1},prefs,trip)
  ];
  const result=compareFlights(trip,prefs,'jamaica');
  assert.equal(result.count,2);
  assert.ok(result.leader.score.atlas_flight_score >= result.runner_up.score.atlas_flight_score);
});

test('Travel Build 5 UI and API expose flight research engine', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Flight Research Engine/);
  assert.match(html,/travel-flight-form/);
  assert.match(js,/atlas_flight_score/);
  assert.match(js,/\/flights/);
  assert.match(server,/travelFlightCollectionMatch/);
  assert.match(server,/compareFlights/);
});


test('Travel Build 6 scores strong all-inclusive adults-only resorts above weak mismatched options', () => {
  const prefs=normalizeTravelPreferences({preferences:{all_inclusive:true,adults_only:true,beach:true,relaxation:true,local_food:true}});
  const trip=emptyTrip({name:'Winter Escape',budget:{target:5000},travelers:2},prefs);
  trip.flight_options=[normalizeFlightOption({destination_id:'jamaica',destination_airport:'MBJ',total_price:950,total_travel_hours:5,layovers:0},prefs,trip)];
  const strong=resortAtlasScore({destination_id:'jamaica',total_stay_cost:3200,all_inclusive:true,adults_only:true,quiet_relaxation:true,beach_score:9,food_score:9,bar_score:8,pool_score:8,room_score:8.5,location_score:9,review_score:4.7,review_count:2400},prefs,trip);
  const weak=resortAtlasScore({destination_id:'jamaica',total_stay_cost:3500,all_inclusive:false,adults_only:false,beach_score:5,food_score:5,bar_score:5,pool_score:6,room_score:6,location_score:6,review_score:3.8,review_count:60,resort_fees:400},prefs,trip);
  assert.ok(strong.atlas_resort_score > weak.atlas_resort_score);
  assert.ok(weak.warnings.includes('Not adults-only'));
  assert.ok(weak.warnings.includes('High resort fees'));
});

test('Travel Build 6 normalizes resort pricing, amenities, reviews, and score', () => {
  const prefs=normalizeTravelPreferences(); const trip=emptyTrip({name:'Trip',dates:{start:'2027-02-01',end:'2027-02-07'}},prefs);
  const resort=normalizeResortOption({name:'Example Resort',destination_id:'jamaica',nightly_rate:400,nights:6,taxes_fees:250,resort_fees:100,all_inclusive:true,adults_only:true,beach_score:9,food_score:8,bar_score:8,room_score:8,location_score:9,review_score:4.6,review_count:1500},prefs,trip);
  assert.equal(resort.total_stay_cost,2750);
  assert.equal(resort.all_inclusive,true);
  assert.equal(resort.review_count,1500);
  assert.equal(typeof resort.score.atlas_resort_score,'number');
});

test('Travel Build 6 resort comparison ranks and filters by destination', () => {
  const prefs=normalizeTravelPreferences(); const trip=emptyTrip({name:'Trip',budget:{target:5000}},prefs);
  trip.resort_options=[
    normalizeResortOption({destination_id:'jamaica',name:'A',total_stay_cost:3000,beach_score:9,food_score:9,bar_score:8,room_score:8,location_score:9,review_score:4.7,review_count:1000},prefs,trip),
    normalizeResortOption({destination_id:'jamaica',name:'B',total_stay_cost:3800,beach_score:6,food_score:6,bar_score:6,room_score:6,location_score:7,review_score:4.0,review_count:400},prefs,trip),
    normalizeResortOption({destination_id:'curacao',name:'C',total_stay_cost:2800,beach_score:8,food_score:8,bar_score:8,room_score:8,location_score:8,review_score:4.5,review_count:800},prefs,trip)
  ];
  const result=compareResorts(trip,prefs,'jamaica');
  assert.equal(result.count,2);
  assert.ok(result.leader.score.atlas_resort_score >= result.runner_up.score.atlas_resort_score);
});

test('Travel Build 6 UI and API expose resort research engine', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Hotel \/ Resort Research Engine/);
  assert.match(html,/travel-resort-form/);
  assert.match(js,/atlas_resort_score/);
  assert.match(js,/\/resorts/);
  assert.match(server,/travelResortCollectionMatch/);
  assert.match(server,/compareResorts/);
});


test('Travel Build 7 package optimizer rewards strong complete-trip combinations', () => {
  const prefs=normalizeTravelPreferences({preferences:{all_inclusive:true,adults_only:true,beach:true,relaxation:true}});
  const trip=emptyTrip({name:'Winter Escape',budget:{target:5000},travelers:2},prefs);
  const destination=normalizeDestinationCandidate({id:'jamaica',name:'Jamaica',estimated_total_cost:4700,flight_hours:5,weather_score:9,lodging_fit_score:9,experience_fit_score:9,simplicity_score:9,traits:{all_inclusive:true,adults_only:true,beach:true,relaxation:true}},prefs,trip);
  trip.destination_candidates=[destination];
  const goodFlight=normalizeFlightOption({id:'f1',destination_id:'jamaica',airline:'Good Air',total_price:950,total_travel_hours:5,layovers:0,bags_included:true,changeable:true},prefs,trip);
  const badFlight=normalizeFlightOption({id:'f2',destination_id:'jamaica',airline:'Long Air',total_price:850,total_travel_hours:12,layovers:2},prefs,trip);
  const goodResort=normalizeResortOption({id:'r1',destination_id:'jamaica',name:'Great Resort',total_stay_cost:3200,all_inclusive:true,adults_only:true,beach_score:9,food_score:9,bar_score:8,room_score:9,location_score:9,review_score:4.7,review_count:2000},prefs,trip);
  const weakResort=normalizeResortOption({id:'r2',destination_id:'jamaica',name:'Weak Resort',total_stay_cost:3400,beach_score:5,food_score:5,bar_score:5,room_score:6,location_score:6,review_score:3.8,review_count:80},prefs,trip);
  trip.flight_options=[goodFlight,badFlight]; trip.resort_options=[goodResort,weakResort];
  const result=optimizeTripPackages(trip,prefs);
  assert.equal(result.count,4);
  assert.equal(result.leader.flight.id,'f1');
  assert.equal(result.leader.resort.id,'r1');
  assert.ok(result.leader.score.atlas_package_score > result.packages.at(-1).score.atlas_package_score);
  assert.equal(result.leader.total_cost,4150);
});

test('Travel Build 7 reports incomplete destinations that cannot form packages', () => {
  const prefs=normalizeTravelPreferences(); const trip=emptyTrip({name:'Trip'},prefs);
  const dest=normalizeDestinationCandidate({id:'curacao',name:'Curacao'},prefs,trip); trip.destination_candidates=[dest];
  const result=optimizeTripPackages(trip,prefs);
  assert.equal(result.count,0);
  assert.deepEqual(result.missing.destinations_without_flights,['Curacao']);
  assert.deepEqual(result.missing.destinations_without_resorts,['Curacao']);
});

test('Travel Build 7 UI and API expose trip package optimizer', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Trip Package Optimizer/);
  assert.match(html,/travel-package-board/);
  assert.match(js,/atlas_package_score/);
  assert.match(js,/\/packages/);
  assert.match(server,/travelPackageMatch/);
  assert.match(server,/optimizeTripPackages/);
});


test('Travel Build 8 shortlists a package and advances research into planning', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Decision trip',status:'Researching',budget:{target:5000}},prefs);
  const destination=normalizeDestinationCandidate({id:'dest',name:'Jamaica',estimated_total_cost:4500,flight_hours:5,weather_score:9,lodging_fit_score:9,experience_fit_score:9,simplicity_score:8},prefs,trip);
  trip.destination_candidates=[destination];
  trip.flight_options=[normalizeFlightOption({id:'flight',destination_id:'dest',airline:'Atlas Air',total_price:900,total_travel_hours:5,layovers:0},prefs,trip)];
  trip.resort_options=[normalizeResortOption({id:'resort',destination_id:'dest',name:'Atlas Resort',total_stay_cost:3500,all_inclusive:true,beach_score:9,food_score:9,bar_score:8,room_score:8,pool_score:8,location_score:8,review_score:4.6,review_count:1000},prefs,trip)];
  const pkg=optimizeTripPackages(trip,prefs).leader;
  const state=updateBookingDecision(trip,{toggle_shortlist_package_id:pkg.id},prefs);
  assert.equal(trip.status,'Planning');
  assert.equal(state.shortlist.length,1);
  assert.equal(state.shortlist[0].id,pkg.id);
});

test('Travel Build 8 locks a preferred package but blocks booking until verification is complete', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Decision trip',status:'Researching',budget:{target:5000}},prefs);
  trip.destination_candidates=[normalizeDestinationCandidate({id:'dest',name:'Curacao',estimated_total_cost:4500,flight_hours:6,weather_score:9,lodging_fit_score:8,experience_fit_score:8,simplicity_score:8},prefs,trip)];
  trip.flight_options=[normalizeFlightOption({id:'flight',destination_id:'dest',airline:'Atlas Air',total_price:900,total_travel_hours:6,layovers:0},prefs,trip)];
  trip.resort_options=[normalizeResortOption({id:'resort',destination_id:'dest',name:'Atlas Resort',total_stay_cost:3400,all_inclusive:true,beach_score:9,food_score:8,bar_score:8,room_score:8,pool_score:8,location_score:8,review_score:4.5,review_count:900},prefs,trip)];
  const pkg=optimizeTripPackages(trip,prefs).leader;
  let state=updateBookingDecision(trip,{preferred_package_id:pkg.id},prefs);
  assert.equal(state.preferred.id,pkg.id);
  assert.equal(state.ready_to_book,false);
  assert.throws(()=>bookPreferredPackage(trip,prefs),/verification/i);
  for(const item of state.verification) state=updateBookingDecision(trip,{verification_item:{id:item.id,complete:true}},prefs);
  assert.equal(state.ready_to_book,true);
  state=bookPreferredPackage(trip,prefs);
  assert.equal(trip.status,'Booked');
  assert.ok(state.decision.booked_at);
});

test('Travel Build 8 decision state preserves a locked package across re-ranking', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Stable choice',budget:{target:5000}},prefs);
  trip.destination_candidates=[normalizeDestinationCandidate({id:'dest',name:'Jamaica',estimated_total_cost:4300,flight_hours:5,weather_score:9,lodging_fit_score:9,experience_fit_score:9,simplicity_score:8},prefs,trip)];
  trip.flight_options=[normalizeFlightOption({id:'f1',destination_id:'dest',airline:'A',total_price:900,total_travel_hours:5,layovers:0},prefs,trip),normalizeFlightOption({id:'f2',destination_id:'dest',airline:'B',total_price:800,total_travel_hours:6,layovers:1},prefs,trip)];
  trip.resort_options=[normalizeResortOption({id:'r1',destination_id:'dest',name:'R1',total_stay_cost:3500,beach_score:9,food_score:9,bar_score:8,room_score:8,pool_score:8,location_score:8,review_score:4.6,review_count:1200},prefs,trip)];
  const packages=optimizeTripPackages(trip,prefs).packages;
  const chosen=packages[1] || packages[0];
  updateBookingDecision(trip,{preferred_package_id:chosen.id},prefs);
  trip.flight_options.find(f=>f.id==='f1').total_price=500;
  const state=bookingDecisionState(trip,prefs);
  assert.equal(state.decision.preferred_package_id,chosen.id);
  assert.equal(state.preferred.id,chosen.id);
});

test('Travel Build 8 UI and API expose shortlist, verification, and booking gates', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Trip Shortlist & Booking Decision/);
  assert.match(html,/travel-verification-board/);
  assert.match(js,/data-package-shortlist/);
  assert.match(js,/renderTravelDecision/);
  assert.match(server,/travelDecisionMatch/);
  assert.match(server,/travelBookMatch/);
});


test('Travel Build 9 normalizes confirmations, payments, and readiness tasks', () => {
  const ops=normalizeTripOperations({confirmations:[{type:'flight',name:'Delta 123',confirmation_number:'ABC123'}],payments:[{label:'Resort balance',amount:1200,status:'scheduled'}]});
  assert.equal(ops.confirmations.length,1);
  assert.equal(ops.confirmations[0].confirmation_number,'ABC123');
  assert.equal(ops.payments[0].amount,1200);
  assert.equal(ops.readiness_tasks.length,6);
});

test('Travel Build 9 computes readiness and payment totals', () => {
  const trip=emptyTrip({name:'Booked trip',status:'Booked'});
  updateTripOperations(trip,{payment:{label:'Flights',amount:900,status:'paid'}});
  updateTripOperations(trip,{payment:{label:'Resort balance',amount:3000,status:'scheduled'}});
  let state=tripOperationsState(trip);
  assert.equal(state.payment_summary.paid,900);
  assert.equal(state.payment_summary.scheduled,3000);
  assert.equal(state.ready_to_travel,false);
  for(const task of state.readiness_tasks) state=updateTripOperations(trip,{readiness_task:{id:task.id,complete:true}});
  assert.equal(state.readiness_percent,100);
  assert.equal(state.ready_to_travel,true);
});

test('Travel Build 9 blocks Traveling until booked-trip readiness is complete', () => {
  const trip=emptyTrip({name:'Booked trip',status:'Booked'});
  assert.throws(()=>startTripTraveling(trip),/readiness|departure/i);
  let state=tripOperationsState(trip);
  updateTripOperations(trip,{confirmation:{type:'flight',name:'Flight',confirmation_number:'FLT1'}});
  updateTripOperations(trip,{confirmation:{type:'lodging',name:'Hotel',confirmation_number:'HOTEL1'}});
  state=tripOperationsState(trip);
  for(const task of state.readiness_tasks) state=updateTripOperations(trip,{readiness_task:{id:task.id,complete:true}});
  let departure=preDepartureState(trip);
  for(const task of departure.checklist) departure=updatePreDeparture(trip,{checklist_item:{id:task.id,complete:true}});
  state=startTripTraveling(trip);
  assert.equal(trip.status,'Traveling');
  assert.equal(state.status,'Traveling');
});

test('Travel Build 9 UI and API expose booked-trip operations and Traveling gate', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Booked Trip Operations/);
  assert.match(html,/travel-readiness-board/);
  assert.match(js,/renderTravelOperations/);
  assert.match(js,/start-travel/);
  assert.match(server,/travelOperationsMatch/);
  assert.match(server,/travelStartMatch/);
});


test('Travel Build 10 computes today, next-up, expenses, and open issues', () => {
  const trip=emptyTrip({name:'Live trip',status:'Traveling'});
  trip.live_trip=normalizeLiveTrip({itinerary:[{id:'a',title:'Breakfast',date:'2026-09-14',time:'09:00'},{id:'b',title:'Tour',date:'2026-09-14',time:'14:00'}],expenses:[{label:'Taxi',amount:42.5}],issues:[{title:'Room key failed',status:'open'}]});
  const state=liveTripState(trip,new Date('2026-09-14T12:00:00.000Z'));
  assert.equal(state.today_items.length,2);
  assert.equal(state.next_up.id,'b');
  assert.equal(state.expense_total,42.5);
  assert.equal(state.open_issue_count,1);
});

test('Travel Build 10 blocks live-trip edits unless the trip is Traveling', () => {
  const trip=emptyTrip({name:'Booked trip',status:'Booked'});
  assert.throws(()=>updateLiveTrip(trip,{expense:{label:'Taxi',amount:25}}),/Traveling/i);
  trip.status='Traveling'; const state=updateLiveTrip(trip,{expense:{label:'Taxi',amount:25,category:'transport'}});
  assert.equal(state.expense_total,25);
});

test('Travel Build 10 updates itinerary status and resolves issues', () => {
  const trip=emptyTrip({name:'Live trip',status:'Traveling'});
  let state=updateLiveTrip(trip,{itinerary_item:{id:'item1',title:'Dinner',date:'2026-09-14',time:'19:00'},issue:{id:'issue1',title:'Transfer late',severity:'high'}});
  assert.equal(state.live_trip.itinerary.length,1); assert.equal(state.open_issue_count,1);
  state=updateLiveTrip(trip,{itinerary_item:{...state.live_trip.itinerary[0],status:'done'},issue:{...state.live_trip.issues[0],status:'resolved'}});
  assert.equal(state.live_trip.itinerary[0].status,'done'); assert.equal(state.open_issue_count,0);
});

test('Travel Build 10 UI and API expose Live Trip Command Center', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8'); const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8'); const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Live Trip Command Center/); assert.match(html,/travel-live-today/); assert.match(js,/renderLiveTravel/); assert.match(js,/What’s Next|next_up/); assert.match(server,/travelLiveMatch/); assert.match(server,/updateLiveTrip/);
});


test('Travel Build 11 normalizes review ratings and final-spend learning fields', () => {
  const review=normalizeTripReview({ratings:{overall:9,resort:8},actual_total_spend:4875.55,loved:['Beach','Beach'],would_return_destination:false});
  assert.equal(review.ratings.overall,9);assert.equal(review.ratings.resort,8);assert.equal(review.actual_total_spend,4875.55);assert.deepEqual(review.loved,['Beach']);assert.equal(review.would_return_destination,false);
});

test('Travel Build 11 derives spend and completes a Traveling trip after an overall rating', () => {
  const prefs=normalizeTravelPreferences(); const trip=emptyTrip({name:'Review trip',status:'Traveling',budget:{target:5000}},prefs);
  trip.live_trip=normalizeLiveTrip({expenses:[{label:'Taxi',amount:50},{label:'Dinner',amount:100}]});
  let state=updateTripReview(trip,{ratings:{overall:9,destination:9},actual_total_spend:4800,loved:['Beach']},prefs);
  assert.equal(state.actual_total_spend,4800); assert.equal(state.review_complete,true);
  for (const item of tripWrapUpState(trip).trip_wrap_up.checklist) updateTripWrapUp(trip,{checklist_item:{id:item.id,complete:true}});
  state=completeTripReview(trip,prefs);assert.equal(trip.status,'Completed');assert.equal(trip.budget.actual,4800);assert.ok(state.review.completed_at);
});

test('Travel Build 11 keeps learned preferences opt-in', () => {
  const prefs=normalizeTravelPreferences({preferences:{all_inclusive:false}}); const trip=emptyTrip({name:'Learning trip',status:'Completed'},prefs);
  trip.destination_candidates=[normalizeDestinationCandidate({id:'d',name:'Island',beach_score:9,estimated_total_cost:4000},prefs,trip)];
  trip.resort_options=[normalizeResortOption({id:'r',destination_id:'d',name:'AI Resort',total_stay_cost:3000,all_inclusive:true},prefs,trip)];
  trip.flight_options=[normalizeFlightOption({id:'f',destination_id:'d',total_price:800,total_travel_hours:5},prefs,trip)];
  const pkg=optimizeTripPackages(trip,prefs).leader; trip.booking_decision=normalizeBookingDecision({preferred_package_id:pkg.id});
  trip.review=normalizeTripReview({ratings:{overall:9,resort:9,destination:9},would_return_destination:false});
  const before=tripReviewState(trip,prefs);assert.equal(prefs.preferences.all_inclusive,false);assert.ok(before.learning_suggestions.some(x=>x.id==='all_inclusive'));
  const applied=applyTripLearning(trip,prefs,['all_inclusive']);assert.equal(applied.preferences.preferences.all_inclusive,true);
});

test('Travel Build 11 UI and API expose post-trip review and explicit learning', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Post-Trip Review & Learning Engine/);assert.match(html,/travel-learning-board/);assert.match(js,/renderTravelReview/);assert.match(js,/apply-learning/);assert.match(server,/travelReviewMatch/);assert.match(server,/travelLearningMatch/);
});


test('Travel Build 12 summarizes completed-trip spend, ratings, and learned signals', () => {
  const prefs=normalizeTravelPreferences(); const state=emptyTravelState(); state.preferences=prefs;
  const a=emptyTrip({name:'Trip A',status:'Completed',budget:{target:5000,actual:4700}},prefs); a.review=normalizeTripReview({ratings:{overall:9,destination:9,flight:7,resort:9,value:9},actual_total_spend:4700,loved:['Beach','Food'],worth_it:['Private transfer'],would_return_destination:true,would_repeat_trip:true}); a.destination_candidates=[normalizeDestinationCandidate({name:'Jamaica',estimated_total_cost:4700},prefs,a)];
  const b=emptyTrip({name:'Trip B',status:'Completed',budget:{target:4000,actual:4200}},prefs); b.review=normalizeTripReview({ratings:{overall:7,destination:7,flight:6,resort:8,value:6},actual_total_spend:4200,loved:['Beach'],disliked:['Long transfer'],would_return_destination:false,would_repeat_trip:false}); b.destination_candidates=[normalizeDestinationCandidate({name:'Curacao',estimated_total_cost:4200},prefs,b)];
  state.trips=[a,b]; const intel=travelIntelligenceDashboard(state,{limit:3});
  assert.equal(intel.completed_trip_count,2); assert.equal(intel.reviewed_trip_count,2); assert.equal(intel.metrics.average_actual_spend,4450); assert.equal(intel.metrics.average_overall_rating,8); assert.equal(intel.learned_signals.loved[0].label,'Beach'); assert.equal(intel.learned_signals.loved[0].count,2); assert.equal(intel.history_confidence,'medium');
});

test('Travel Build 12 recommendations respect avoid destinations and expose confidence', () => {
  const state=emptyTravelState(); state.preferences=normalizeTravelPreferences({avoid_destinations:['Punta Cana'],preferences:{beach:true,all_inclusive:true}}); const intel=travelIntelligenceDashboard(state,{budget:5000,limit:6});
  assert.equal(intel.recommendations.some(x=>/Punta Cana/i.test(x.name)),false); assert.equal(intel.recommendations.length,6); assert.equal(intel.history_confidence,'low'); assert.ok(intel.recommendations.every(x=>x.research_type==='intelligence_recommendation'));
});

test('Travel Build 12 uses completed destination feedback as a bounded recommendation adjustment', () => {
  const prefs=normalizeTravelPreferences(); const state=emptyTravelState(); state.preferences=prefs; const trip=emptyTrip({name:'Past Jamaica',status:'Completed',budget:{target:5000}},prefs); trip.destination_candidates=[normalizeDestinationCandidate({name:'Jamaica',estimated_total_cost:4500},prefs,trip)]; trip.review=normalizeTripReview({ratings:{overall:9,destination:10},actual_total_spend:4600,would_return_destination:true}); state.trips=[trip]; const intel=travelIntelligenceDashboard(state,{budget:5000,limit:10}); const jamaica=intel.recommendations.find(x=>/Jamaica/i.test(x.name)); assert.ok(jamaica); assert.ok(jamaica.history_adjustment>0); assert.ok(jamaica.history_adjustment<=8);
});

test('Travel Build 12 UI and API expose the Travel Intelligence Dashboard', () => {
  const fs=require('node:fs'); const path=require('node:path'); const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8'); const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8'); const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Travel Intelligence Dashboard/); assert.match(html,/travel-intelligence-recommendations/); assert.match(js,/renderTravelIntelligence/); assert.match(server,/\/api\/travel\/intelligence/); assert.match(server,/travelIntelligenceDashboard/);
});


test('Travel Build 13 normalizes scenario costs and preserves assumptions', () => {
  const prefs=normalizeTravelPreferences({preferred_max_flight_hours:7,preferred_max_layovers:1});
  const trip=emptyTrip({name:'Scenario trip',budget:{target:5000},travelers:2},prefs);
  const scenario=normalizeTripScenario({name:'Jamaica nonstop',destination:'Montego Bay, Jamaica',flight_total:900,lodging_total:3200,taxes_fees:250,activity_allowance:300,other_costs:100,flight_hours:5.2,layovers:0,lodging_score:9,nights:7},trip,prefs);
  assert.equal(scenario.total_cost,4750); assert.equal(scenario.budget_target,5000); assert.equal(scenario.score.budget_delta,250); assert.ok(scenario.score.atlas_scenario_score>=70); assert.equal(scenario.nights,7);
});

test('Travel Build 13 ranks what-if scenarios and identifies cost/travel tradeoffs', () => {
  const prefs=normalizeTravelPreferences({preferred_max_flight_hours:7,preferred_max_layovers:1});
  const trip=emptyTrip({name:'Winter what-ifs',budget:{target:5000}},prefs);
  trip.scenario_plans=[
    normalizeTripScenario({id:'fast',name:'Better nonstop',destination:'Montego Bay, Jamaica',total_cost:4700,flight_hours:5,layovers:0,lodging_score:9},trip,prefs),
    normalizeTripScenario({id:'cheap',name:'Cheapest long route',destination:'Montego Bay, Jamaica',total_cost:4300,flight_hours:12,layovers:2,lodging_score:7},trip,prefs)
  ];
  const result=compareTripScenarios(trip,prefs);
  assert.equal(result.count,2); assert.equal(result.cheapest_scenario_id,'cheap'); assert.equal(result.fastest_scenario_id,'fast'); assert.equal(result.leader.id,'fast'); assert.ok(result.score_gap>0);
});

test('Travel Build 13 UI and API expose persistent scenario planning', () => {
  const fs=require('node:fs'); const path=require('node:path'); const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8'); const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8'); const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Trip Scenario Planner/); assert.match(html,/travel-scenario-board/); assert.match(js,/renderTravelScenarios/); assert.match(server,/travelScenarioCollectionMatch/); assert.match(server,/compareTripScenarios/);
});


test('Travel Build 14 watchlist marks a never-checked scenario as recheck due', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Watch trip',budget:{target:5000}},prefs);
  const scenario=normalizeTripScenario({id:'s1',name:'Jamaica nonstop',destination:'Montego Bay, Jamaica',total_cost:4700,flight_hours:5,layovers:0,lodging_score:9},trip,prefs);
  trip.scenario_plans=[scenario];
  const watch=addScenarioWatch(trip,{scenario_id:'s1',target_total:4500,label:'Jamaica under 4500'},prefs);
  const state=travelWatchlistState(trip,prefs,Date.parse('2026-09-14T16:00:00Z'));
  assert.equal(state.count,1);
  assert.equal(state.watches[0].id,watch.id);
  assert.equal(state.watches[0].recheck_due,true);
  assert.equal(state.watches[0].current_total,4700);
  assert.equal(state.watches[0].target_hit,false);
});

test('Travel Build 14 records price history and detects target hit', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Watch trip',budget:{target:5000}},prefs);
  trip.scenario_plans=[normalizeTripScenario({id:'s1',name:'Curacao',destination:'Curacao',total_cost:4800},trip,prefs)];
  const watch=addScenarioWatch(trip,{scenario_id:'s1',target_total:4500},prefs);
  recordScenarioWatchCheck(trip,watch.id,{total_cost:4650,source:'Saved quote',checked_at:'2026-09-14T10:00:00Z'},prefs);
  recordScenarioWatchCheck(trip,watch.id,{total_cost:4400,source:'Provider X',live_data:true,checked_at:'2026-09-14T12:00:00Z'},prefs);
  const state=travelWatchlistState(trip,prefs,Date.parse('2026-09-14T13:00:00Z'));
  const item=state.watches[0];
  assert.equal(item.target_hit,true);
  assert.equal(item.status,'target_hit');
  assert.equal(item.change_amount,-250);
  assert.equal(item.change_percent, -5.4);
  assert.equal(item.live_data,true);
  assert.equal(item.source,'Provider X');
  assert.equal(state.target_hit_count,1);
});

test('Travel Build 14 does not accept an unsourced live recheck', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Watch trip'},prefs);
  trip.scenario_plans=[normalizeTripScenario({id:'s1',name:'Scenario',destination:'Jamaica',total_cost:4500},trip,prefs)];
  const watch=addScenarioWatch(trip,{scenario_id:'s1',target_total:4300},prefs);
  assert.throws(()=>recordScenarioWatchCheck(trip,watch.id,{total_cost:4200,live_data:true,source:''},prefs),/source/i);
});

test('Travel Build 14 UI and API expose watchlist, freshness, and recheck controls', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Travel Watchlist & Recheck Engine/);
  assert.match(html,/travel-watch-board/);
  assert.match(js,/renderTravelWatchlist/);
  assert.match(js,/Record recheck/);
  assert.match(server,/travelWatchCollectionMatch/);
  assert.match(server,/recordScenarioWatchCheck/);
});


test('Travel Build 15 prioritizes target hits and manual-price verification', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Alert trip',budget:{target:5000}},prefs);
  trip.scenario_plans=[normalizeTripScenario({id:'s1',name:'Jamaica',destination:'Montego Bay, Jamaica',total_cost:4700},trip,prefs)];
  const watch=addScenarioWatch(trip,{scenario_id:'s1',target_total:4500,label:'Jamaica deal'},prefs);
  recordScenarioWatchCheck(trip,watch.id,{total_cost:4450,source:'Manual recheck',live_data:false,checked_at:'2026-09-14T16:00:00Z'},prefs);
  const queue=travelActionQueue(trip,prefs,Date.parse('2026-09-14T17:00:00Z'));
  assert.equal(queue.urgent_count,1);
  assert.equal(queue.next_action.type,'target_hit');
  assert.ok(queue.actions.some(x=>x.type==='verification_needed'&&x.priority==='high'));
});

test('Travel Build 15 detects meaningful drops before target is hit', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Drop trip'},prefs);
  trip.scenario_plans=[normalizeTripScenario({id:'s1',name:'Curacao',destination:'Curacao',total_cost:5000},trip,prefs)];
  const watch=addScenarioWatch(trip,{scenario_id:'s1',target_total:4300},prefs);
  recordScenarioWatchCheck(trip,watch.id,{total_cost:4800,source:'Provider',live_data:true,checked_at:'2026-09-14T14:00:00Z'},prefs);
  recordScenarioWatchCheck(trip,watch.id,{total_cost:4550,source:'Provider',live_data:true,checked_at:'2026-09-14T16:00:00Z'},prefs);
  const queue=travelActionQueue(trip,prefs,Date.parse('2026-09-14T17:00:00Z'));
  const drop=queue.actions.find(x=>x.type==='meaningful_drop');
  assert.ok(drop); assert.equal(drop.priority,'high'); assert.equal(drop.change_amount,-250);
});

test('Travel Build 15 acknowledges and snoozes derived actions persistently', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Action trip'},prefs);
  trip.scenario_plans=[normalizeTripScenario({id:'s1',name:'Aruba',destination:'Aruba',total_cost:4600},trip,prefs)];
  addScenarioWatch(trip,{scenario_id:'s1',target_total:4400,label:'Aruba watch'},prefs);
  const now=Date.parse('2026-09-14T17:00:00Z');
  let queue=travelActionQueue(trip,prefs,now); const action=queue.actions.find(x=>x.type==='recheck_due'); assert.ok(action);
  queue=updateTravelAction(trip,action.id,{acknowledged:true},prefs,now); assert.equal(queue.open_count,0); assert.equal(queue.actions.find(x=>x.id===action.id).acknowledged,true);
  queue=updateTravelAction(trip,action.id,{acknowledged:false,snoozed_until:'2026-09-15T17:00:00Z'},prefs,now); assert.equal(queue.open_count,0); assert.equal(queue.actions.find(x=>x.id===action.id).snoozed,true);
});

test('Travel Build 15 UI and API expose prioritized travel actions', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8'); const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8'); const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Travel Alerts & Action Queue/); assert.match(html,/travel-action-board/); assert.match(js,/renderTravelActions/); assert.match(js,/Snooze 24h/); assert.match(server,/travelActionsCollectionMatch/); assert.match(server,/updateTravelAction/);
});


test('Travel Build 16 recommends book now only for a fresh live-backed target hit', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Ready trip',budget:{target:5000}},prefs);
  trip.scenario_plans=[normalizeTripScenario({id:'s1',name:'Jamaica nonstop',destination:'Montego Bay, Jamaica',total_cost:4700,flight_hours:5,layovers:0,lodging_score:9},trip,prefs)];
  const watch=addScenarioWatch(trip,{scenario_id:'s1',target_total:4500,label:'Jamaica deal'},prefs);
  recordScenarioWatchCheck(trip,watch.id,{total_cost:4450,source:'Provider X',live_data:true,checked_at:'2026-09-14T16:00:00Z'},prefs);
  const state=travelBookingReadinessCenter(trip,prefs,Date.parse('2026-09-14T17:00:00Z'));
  assert.equal(state.book_now_count,1); assert.equal(state.leader.decision,'book_now'); assert.equal(state.leader.live_verified,true); assert.equal(state.leader.fresh_quote,true); assert.ok(state.leader.readiness_score>=90);
});

test('Travel Build 16 requires verification when target is hit only by a manual quote', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Verify trip',budget:{target:5000}},prefs);
  trip.scenario_plans=[normalizeTripScenario({id:'s1',name:'Curacao',destination:'Curacao',total_cost:4600},trip,prefs)];
  const watch=addScenarioWatch(trip,{scenario_id:'s1',target_total:4500},prefs);
  recordScenarioWatchCheck(trip,watch.id,{total_cost:4400,source:'Manual recheck',live_data:false,checked_at:'2026-09-14T16:00:00Z'},prefs);
  const state=travelBookingReadinessCenter(trip,prefs,Date.parse('2026-09-14T17:00:00Z'));
  assert.equal(state.verify_now_count,1); assert.equal(state.leader.decision,'verify_now'); assert.ok(state.leader.blockers.some(x=>/not verified/i.test(x)));
});

test('Travel Build 16 prioritizes recheck when evidence is stale', () => {
  const prefs=normalizeTravelPreferences();
  const trip=emptyTrip({name:'Stale trip'},prefs);
  trip.scenario_plans=[normalizeTripScenario({id:'s1',name:'Aruba',destination:'Aruba',total_cost:4500},trip,prefs)];
  const watch=addScenarioWatch(trip,{scenario_id:'s1',target_total:4400},prefs);
  recordScenarioWatchCheck(trip,watch.id,{total_cost:4450,source:'Provider',live_data:true,checked_at:'2026-09-12T10:00:00Z'},prefs);
  const state=travelBookingReadinessCenter(trip,prefs,Date.parse('2026-09-14T17:00:00Z'));
  assert.equal(state.recheck_now_count,1); assert.equal(state.leader.decision,'recheck_now'); assert.equal(state.leader.fresh_quote,false);
});

test('Travel Build 16 UI and API expose decision and booking readiness', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8'); const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8'); const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Decision & Booking Readiness Center/); assert.match(html,/travel-readiness-board/); assert.match(js,/renderTravelReadiness/); assert.match(server,/travelReadinessMatch/); assert.match(server,/travelBookingReadinessCenter/);
});


test('Travel Build 17 starts execution only from BOOK or VERIFY readiness', () => {
  const prefs=normalizeTravelPreferences(); const trip=emptyTrip({name:'Book flow',budget:{target:5000}},prefs);
  trip.scenario_plans=[normalizeTripScenario({id:'s1',name:'Jamaica nonstop',destination:'Montego Bay, Jamaica',total_cost:4700,flight_hours:5,layovers:0,lodging_score:9},trip,prefs)];
  const watch=addScenarioWatch(trip,{scenario_id:'s1',target_total:4500,label:'Jamaica deal'},prefs);
  recordScenarioWatchCheck(trip,watch.id,{total_cost:4475,source:'Provider X',live_data:true,checked_at:'2026-09-14T16:00:00Z'},prefs);
  const state=startBookingExecution(trip,{watch_id:watch.id},prefs,Date.parse('2026-09-14T17:00:00Z'));
  assert.equal(state.started,true); assert.equal(state.candidate.decision,'book_now'); assert.equal(state.execution.final_quote.total_cost,4475);
});

test('Travel Build 17 blocks finalization until live quote, gates, confirmation, and payment are complete', () => {
  const prefs=normalizeTravelPreferences(); const trip=emptyTrip({name:'Book flow',budget:{target:5000}},prefs);
  trip.scenario_plans=[normalizeTripScenario({id:'s1',name:'Curacao',destination:'Curacao',total_cost:4600},trip,prefs)];
  const watch=addScenarioWatch(trip,{scenario_id:'s1',target_total:4500},prefs); recordScenarioWatchCheck(trip,watch.id,{total_cost:4400,source:'Manual recheck',live_data:false,checked_at:'2026-09-14T16:00:00Z'},prefs);
  startBookingExecution(trip,{watch_id:watch.id},prefs,Date.parse('2026-09-14T17:00:00Z'));
  assert.throws(()=>finalizeBookingExecution(trip,prefs,Date.parse('2026-09-14T17:05:00Z')),/not ready/i);
  updateBookingExecution(trip,{final_quote:{total_cost:4425,source:'Provider Y',live_data:true,captured_at:'2026-09-14T17:05:00Z'}},prefs,Date.parse('2026-09-14T17:05:00Z'));
  for(const id of ['final_quote','availability','itinerary','cancellation_terms','traveler_details','payment_ready']) updateBookingExecution(trip,{checklist_item:{id,complete:true}},prefs,Date.parse('2026-09-14T17:06:00Z'));
  updateBookingExecution(trip,{purchase:{provider:'Provider Y',confirmation_number:'ABC123',amount_paid:4425,payment_status:'paid',booked_at:'2026-09-14T17:10:00Z'}},prefs,Date.parse('2026-09-14T17:10:00Z'));
  const ready=bookingExecutionState(trip,prefs,Date.parse('2026-09-14T17:11:00Z')); assert.equal(ready.can_finalize,true);
});

test('Travel Build 17 finalization moves trip to Booked and hands confirmation/payment to operations', () => {
  const prefs=normalizeTravelPreferences(); const trip=emptyTrip({name:'Book flow',status:'Planning',budget:{target:5000}},prefs);
  trip.scenario_plans=[normalizeTripScenario({id:'s1',name:'Aruba',destination:'Aruba',total_cost:4500},trip,prefs)]; const watch=addScenarioWatch(trip,{scenario_id:'s1',target_total:4500,label:'Aruba'},prefs); recordScenarioWatchCheck(trip,watch.id,{total_cost:4450,source:'Provider',live_data:true,checked_at:'2026-09-14T16:00:00Z'},prefs);
  startBookingExecution(trip,{watch_id:watch.id},prefs,Date.parse('2026-09-14T17:00:00Z')); for(const id of ['final_quote','availability','itinerary','cancellation_terms','traveler_details','payment_ready']) updateBookingExecution(trip,{checklist_item:{id,complete:true}},prefs,Date.parse('2026-09-14T17:01:00Z'));
  updateBookingExecution(trip,{purchase:{provider:'Provider',confirmation_number:'CONF-77',amount_paid:4450,payment_status:'paid'}},prefs,Date.parse('2026-09-14T17:02:00Z'));
  const result=finalizeBookingExecution(trip,prefs,Date.parse('2026-09-14T17:03:00Z')); assert.equal(trip.status,'Booked'); assert.equal(trip.budget.booked,4450); assert.equal(result.status,'completed'); assert.ok(trip.trip_operations.confirmations.some(x=>x.confirmation_number==='CONF-77')); assert.ok(trip.trip_operations.payments.some(x=>x.amount===4450));
});

test('Travel Build 17 UI and API expose booking execution and remove readiness ID collision', () => {
  const fs=require('node:fs'); const path=require('node:path'); const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8'),js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8'),server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Booking Execution & Confirmation Center/); assert.match(html,/travel-booking-execution-board/); assert.match(js,/renderTravelBookingExecution/); assert.match(server,/travelBookingExecutionMatch/); assert.match(server,/finalizeBookingExecution/); assert.equal((html.match(/id="travel-readiness-board"/g)||[]).length,1); assert.equal((html.match(/id="travel-booking-readiness-board"/g)||[]).length,1);
});


test('Travel Build 18 normalizes departure checklist and notes', () => {
  const pre=normalizePreDeparture({checklist:[{id:'bags_packed',complete:true}],document_notes:'Passports in safe',packing_notes:'Pack chargers'});
  assert.equal(pre.checklist.length,6);assert.equal(pre.checklist.find(x=>x.id==='bags_packed').complete,true);assert.equal(pre.document_notes,'Passports in safe');assert.equal(pre.packing_notes,'Pack chargers');
});

test('Travel Build 18 computes countdown, blockers, and 100 percent departure clearance', () => {
  const trip=emptyTrip({name:'Departure trip',status:'Booked',dates:{start:'2026-09-20'},budget:{target:5000}});
  updateTripOperations(trip,{confirmation:{type:'flight',name:'Delta 123',confirmation_number:'FLT123'}});
  updateTripOperations(trip,{confirmation:{type:'lodging',name:'Resort',confirmation_number:'HOTEL123'}});
  updateTripOperations(trip,{payment:{label:'Final balance',amount:1000,status:'scheduled',due_date:'2026-09-18'}});
  let ops=tripOperationsState(trip);for(const task of ops.readiness_tasks)ops=updateTripOperations(trip,{readiness_task:{id:task.id,complete:true}});
  let state=preDepartureState(trip,Date.parse('2026-09-14T17:00:00Z'));assert.equal(state.days_until_departure,6);assert.equal(state.ready_to_depart,false);
  for(const task of state.checklist)state=updatePreDeparture(trip,{checklist_item:{id:task.id,complete:true}},Date.parse('2026-09-14T17:05:00Z'));
  state=preDepartureState(trip,Date.parse('2026-09-14T17:10:00Z'));assert.equal(state.readiness_score,100);assert.equal(state.ready_to_depart,true);assert.equal(state.payment_summary.planned_blockers,0);
});

test('Travel Build 18 blocks departure for planned payment or missing core confirmation', () => {
  const trip=emptyTrip({name:'Blocked trip',status:'Booked',dates:{start:'2026-09-20'}});
  updateTripOperations(trip,{confirmation:{type:'flight',name:'Flight',confirmation_number:'F1'}});
  updateTripOperations(trip,{payment:{label:'Hotel balance',amount:900,status:'planned',due_date:'2026-09-19'}});
  let ops=tripOperationsState(trip);for(const task of ops.readiness_tasks)ops=updateTripOperations(trip,{readiness_task:{id:task.id,complete:true}});
  let state=preDepartureState(trip,Date.parse('2026-09-14T17:00:00Z'));for(const task of state.checklist)state=updatePreDeparture(trip,{checklist_item:{id:task.id,complete:true}},Date.parse('2026-09-14T17:01:00Z'));
  state=preDepartureState(trip,Date.parse('2026-09-14T17:02:00Z'));assert.equal(state.ready_to_depart,false);assert.equal(state.payment_summary.planned_blockers,1);assert.ok(state.blockers.some(x=>/Lodging confirmation/i.test(x)));assert.throws(()=>startTripTraveling(trip),/departure clearance/i);
});

test('Travel Build 18 UI and API expose Pre-Departure Command Center', () => {
  const fs=require('node:fs');const path=require('node:path');const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8'),js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8'),server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Pre-Departure Command Center/);assert.match(html,/travel-predeparture-checklist/);assert.match(js,/renderPreDeparture/);assert.match(js,/updatePreDeparture/);assert.match(server,/travelPreDepartureMatch/);assert.match(server,/preDepartureState/);
});


test('Travel Build 19 normalizes disruption recovery and contacts', () => {
  const state=normalizeTripResilience({disruptions:[{title:'Flight cancelled',type:'flight',severity:'high',current_situation:'Cancelled at gate'}],emergency_contacts:[{label:'Travel insurance',phone:'555-1212'}],recovery_notes:'Keep receipts'});
  assert.equal(state.disruptions.length,1);assert.equal(state.disruptions[0].status,'open');assert.equal(state.emergency_contacts[0].label,'Travel insurance');assert.equal(state.recovery_notes,'Keep receipts');
});

test('Travel Build 19 prioritizes critical disruption and provides next recovery action', () => {
  const trip=emptyTrip({name:'Live trip',status:'Traveling'});
  updateTripResilience(trip,{disruption:{title:'Room not ready',type:'lodging',severity:'medium',current_situation:'No room'}},Date.parse('2026-09-14T18:00:00Z'));
  let state=updateTripResilience(trip,{disruption:{title:'Medical emergency',type:'health',severity:'critical',current_situation:'Needs immediate care'}},Date.parse('2026-09-14T18:05:00Z'));
  assert.equal(state.active_count,2);assert.equal(state.stability,'critical');assert.equal(state.next_action.title,'Medical emergency');assert.match(state.next_action.guidance,/safety|emergency/i);
});

test('Travel Build 19 enforces Traveling guard and live-source truthfulness', () => {
  const booked=emptyTrip({name:'Booked',status:'Booked'});assert.throws(()=>updateTripResilience(booked,{disruption:{title:'Delay'}}),/Traveling/i);
  const trip=emptyTrip({name:'Live',status:'Traveling'});assert.throws(()=>updateTripResilience(trip,{disruption:{title:'Delay',live_data:true}}),/source is required/i);
  const state=updateTripResilience(trip,{disruption:{title:'Carrier delay',type:'flight',severity:'high',source:'Airline provider',live_data:true}},Date.parse('2026-09-14T18:10:00Z'));assert.equal(state.next_action.source_status,'live-backed');
});

test('Travel Build 19 resolves disruptions while preserving recovery record', () => {
  const trip=emptyTrip({name:'Live',status:'Traveling'});let state=updateTripResilience(trip,{disruption:{title:'Transfer missed',type:'transfer',severity:'high',recovery_plan:'Taxi to resort'}},Date.parse('2026-09-14T18:00:00Z'));const item=state.disruptions[0];state=updateTripResilience(trip,{disruption:{...item,status:'resolved'}},Date.parse('2026-09-14T18:30:00Z'));assert.equal(state.active_count,0);assert.equal(state.resolved_count,1);assert.equal(state.disruptions[0].recovery_plan,'Taxi to resort');assert.ok(state.disruptions[0].resolved_at);
});

test('Travel Build 19 UI and API expose Live Trip Resilience Center', () => {
  const fs=require('node:fs'),path=require('node:path');const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8'),js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8'),server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Live Trip Resilience Center/);assert.match(html,/travel-resilience-board/);assert.match(js,/renderTravelResilience/);assert.match(js,/updateTravelResilience/);assert.match(server,/travelResilienceMatch/);assert.match(server,/tripResilienceState/);
});


test('Travel Build 20 starts wrap-up blocked by active disruptions and incomplete closure checks', () => {
  const trip=emptyTrip({name:'Wrap trip',status:'Traveling'});
  trip.trip_resilience=normalizeTripResilience({disruptions:[{id:'d1',title:'Cancelled tour',severity:'medium',status:'active'}]});
  const state=tripWrapUpState(trip);
  assert.equal(state.ready_to_complete,false); assert.equal(state.active_disruption_count,1); assert.ok(state.blockers.some(x=>/disruption/i.test(x))); assert.equal(state.closure_score,17);
});

test('Travel Build 20 requires deferred recovery money items to have a follow-up date', () => {
  const trip=emptyTrip({name:'Wrap trip',status:'Traveling'});
  assert.throws(()=>updateTripWrapUp(trip,{money_item:{label:'Airline credit',type:'credit',amount:300,status:'deferred'}}),/follow-up date/i);
  const state=updateTripWrapUp(trip,{money_item:{label:'Airline credit',type:'credit',amount:300,status:'deferred',follow_up_date:'2026-10-01'}});
  assert.equal(state.open_money_item_count,0); assert.equal(state.money_items[0].amount,300);
});

test('Travel Build 20 reaches 100% closure when disruptions are resolved, money is handled, and checks are complete', () => {
  const trip=emptyTrip({name:'Wrap trip',status:'Traveling'});
  trip.trip_resilience=normalizeTripResilience({disruptions:[{id:'d1',title:'Delay',status:'resolved'}]});
  updateTripWrapUp(trip,{money_item:{label:'Hotel refund',type:'refund',amount:125,status:'resolved'}});
  for (const item of tripWrapUpState(trip).trip_wrap_up.checklist) updateTripWrapUp(trip,{checklist_item:{id:item.id,complete:true}});
  const state=tripWrapUpState(trip);
  assert.equal(state.ready_to_complete,true); assert.equal(state.closure_score,100); assert.equal(state.blockers.length,0);
});

test('Travel Build 20 blocks completion until wrap-up is operationally closed', () => {
  const prefs=normalizeTravelPreferences(); const trip=emptyTrip({name:'Finish trip',status:'Traveling'},prefs);
  updateTripReview(trip,{ratings:{overall:9},actual_total_spend:4500},prefs);
  assert.throws(()=>completeTripReview(trip,prefs),/wrap-up/i);
  for (const item of tripWrapUpState(trip).trip_wrap_up.checklist) updateTripWrapUp(trip,{checklist_item:{id:item.id,complete:true}});
  const state=completeTripReview(trip,prefs); assert.equal(trip.status,'Completed'); assert.ok(state.review.completed_at);
});

test('Travel Build 20 UI and API expose trip closure and recovery wrap-up', () => {
  const fs=require('node:fs'); const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8'); const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8'); const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(html,/Trip Completion & Recovery Wrap-Up Center/); assert.match(html,/travel-wrap-up-board/); assert.match(js,/renderTravelWrapUp/); assert.match(server,/travelWrapUpMatch/); assert.match(server,/updateTripWrapUp/);
});
