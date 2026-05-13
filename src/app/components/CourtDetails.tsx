import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Star, Clock, Users, Share2, Heart, Phone, Mail, ChevronLeft, ChevronRight, GraduationCap, Loader2, Plus, Minus, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type TabType = 'home' | 'book' | 'open-games' | 'classes';

const SPORT_LABELS: Record<string, string> = {
  football: 'Society', society: 'Society', futsal: 'Futsal',
  tennis: 'Tênis', padel: 'Padel', basketball: 'Basquete',
  volleyball: 'Vôlei', beach_tennis: 'Beach Tennis',
};

function sportLabel(s: string) {
  return SPORT_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function buildWeekDays() {
  const DAY_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return {
      date: `${yyyy}-${mm}-${dd}`,
      dayLabel: DAY_LABELS[d.getDay()],
      dayNum: String(d.getDate()).padStart(2, '0'),
      monthLabel: MONTH_LABELS[d.getMonth()],
    };
  });
}

interface SlotItem {
  id: string;
  time: string;
  endTime90: string;  // end time for 90min
  endTime120: string; // end time for 120min
  available90: boolean;
  available120: boolean;
  pricePerHour: number;
  hasGame?: boolean;
  gameId?: string;
  isDynamic: boolean;
}

interface CourtSchedule {
  open_time: string;   // 'HH:MM'
  close_time: string;
  price: number;       // price per hour
}

interface SelectedSlot {
  slotId: string;       // empty string for dynamic slots
  courtId: string;
  courtName: string;
  time: string;
  endTime: string;      // set based on chosen duration
  price: number;        // total for chosen duration
  pricePerHour: number;
  isDynamic: boolean;
}

const CourtDetails: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('book');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const weekDays = buildWeekDays();
  const [selectedDate, setSelectedDate] = useState(weekDays[1].date);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const slotPanelRef = useRef<HTMLDivElement>(null);
  const fetchSlotsRef = useRef(fetchSlots);

  // Venue + primary court info (for header/home tab)
  const [venue, setVenue] = useState<any>(null);
  const [court, setCourt] = useState<any>({
    id: id || '',
    name: 'Carregando...',
    venueName: '',
    images: ['https://images.unsplash.com/photo-1624880357913-a8539238245b?w=800&q=80'],
    amenities: [],
    price: 0,
    rating: 0,
    reviews: 0,
  });

  // All courts for this venue (for booking tab)
  const [venueCourts, setVenueCourts] = useState<{ id: string; name: string; sport_type: string; price_per_hour: number }[]>([]);

  // Slots per court for the selected date
  const [slotsByCourt, setSlotsByCourt] = useState<Record<string, SlotItem[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  // Selected slot (across all courts)
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<90 | 120>(90);

  // court_schedules: courtId → schedule for selected date's day_of_week
  const [courtSchedules, setCourtSchedules] = useState<Record<string, CourtSchedule>>({});

  // Open-games tab state
  const [openGamesBySlot, setOpenGamesBySlot] = useState<Record<string, any>>({});
  const [selectedOpenSlot, setSelectedOpenSlot] = useState<SelectedSlot | null>(null);
  const OPEN_MAX_PLAYERS = 18;
  const OPEN_MIN_PLAYERS = 10;

  // Private game booking state
  const PRIVATE_MAX_PLAYERS = 18;
  const [privatePayMode, setPrivatePayMode] = useState<'full' | 'split'>('full');

  function minPlayersForCourt(_courtId: string) {
    return 10;
  }

  function maxPlayersForCourt(courtId: string) {
    const sport = venueCourts.find(c => c.id === courtId)?.sport_type ?? '';
    if (sport === 'football' || sport === 'society' || sport === 'futsal') return 18;
    return 8;
  }

  function defaultPrivatePlayersForCourt(courtId: string) {
    const sport = venueCourts.find(c => c.id === courtId)?.sport_type ?? '';
    if (sport === 'football' || sport === 'society' || sport === 'futsal') return 10;
    return 4;
  }

  // ── Fetch court + venue ───────────────────────────────────
  useEffect(() => {
    if (!id) return;
    async function fetchCourtAndVenue() {
      const { data: courtData } = await supabase.from('courts').select('*').eq('id', id).single();
      if (!courtData) return;

      let venueData: any = null;
      if (courtData.venue_id) {
        const { data: v } = await supabase
          .from('venues')
          .select('id, name, address, city, phone, email, description, opening_hours')
          .eq('id', courtData.venue_id)
          .single();
        venueData = v;
      }

      setVenue(venueData);
      setCourt({
        id: courtData.id,
        name: courtData.name,
        venueName: venueData?.name ?? '',
        images: courtData.images?.length > 0
          ? courtData.images
          : ['https://images.unsplash.com/photo-1624880357913-a8539238245b?w=800&q=80'],
        amenities: courtData.amenities ?? [],
        price: courtData.price_per_hour ?? 0,
        rating: courtData.rating ?? 0,
        reviews: courtData.review_count ?? 0,
      });

      // Fetch all courts for this venue
      if (courtData.venue_id) {
        const { data: allCourts } = await supabase
          .from('courts')
          .select('id, name, sport_type, price_per_hour')
          .eq('venue_id', courtData.venue_id)
          .neq('is_active', false)
          .order('name');
        setVenueCourts(allCourts ?? []);
      }
    }
    fetchCourtAndVenue();
  }, [id]);

  // ── Fetch slots for all venue courts on selected date ─────
  async function fetchSlots(courts = venueCourts, date = selectedDate) {
    if (!courts.length) return;
    setLoadingSlots(true);

    const dayOfWeek = new Date(date + 'T12:00:00').getDay();

    // Fetch court_schedules for this day
    const { data: scheduleRows } = await supabase
      .from('court_schedules')
      .select('court_id, open_time, close_time, price')
      .in('court_id', courts.map(c => c.id))
      .eq('day_of_week', dayOfWeek);

    const scheduleMap: Record<string, CourtSchedule> = {};
    (scheduleRows ?? []).forEach(s => { scheduleMap[s.court_id] = s; });
    setCourtSchedules(scheduleMap);

    // Fetch existing slots (created at booking time) — these are "occupied" blocks
    const { data: existingSlots } = await supabase
      .from('slots')
      .select('id, court_id, start_time, end_time, is_available, price_override')
      .in('court_id', courts.map(c => c.id))
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`);

    // Fetch open games for those slots
    const slotIds = (existingSlots ?? []).map(s => s.id);
    const gameBySlotId: Record<string, string> = {};
    if (slotIds.length > 0) {
      const { data: gamesData } = await supabase
        .from('games')
        .select('id, slot_id')
        .in('slot_id', slotIds)
        .not('status', 'in', '("expired","cancelled")')
        .eq('is_open', true);
      (gamesData ?? []).forEach(g => { if (g.slot_id) gameBySlotId[g.slot_id] = g.id; });
    }

    const byCourtId: Record<string, SlotItem[]> = {};
    for (const c of courts) {
      const schedule = scheduleMap[c.id];
      const allCourtSlots = (existingSlots ?? []).filter(s => s.court_id === c.id);

      // Pre-created slots are always the source of truth.
      // Deleted slots don't appear; blocked slots are unavailable; empty = nothing to show.
      byCourtId[c.id] = generateFromPreCreatedSlots(schedule ?? null, allCourtSlots, date, gameBySlotId, c.price_per_hour);
    }
    setSlotsByCourt(byCourtId);
    setLoadingSlots(false);
  }
  fetchSlotsRef.current = fetchSlots;

  function timeDiffMins(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  }

  function generateDynamicSlots(
    schedule: CourtSchedule,
    bookedSlots: any[],
    date: string,
    gameBySlotId: Record<string, string>,
    fallbackPrice: number,
  ): SlotItem[] {
    const [oh, om] = schedule.open_time.split(':').map(Number);
    const [ch, cm] = schedule.close_time.split(':').map(Number);
    const openMins = oh * 60 + om;
    const closeMins = ch * 60 + cm;
    const schedulePrice = schedule.price || fallbackPrice;

    // Build booked intervals from existing slots (unavailable = blocked/booked)
    const bookedIntervals = bookedSlots
      .filter(s => !s.is_available)
      .map(s => {
        const startMins = timeToMins(s.start_time.substring(11, 16));
        const endMins = s.end_time
          ? timeToMins(s.end_time.substring(11, 16))
          : startMins + 90;
        return { startMins, endMins, slotId: s.id };
      });

    // Index available batch-created slots by their start time for quick lookup
    const availableSlotByTime: Record<string, any> = {};
    bookedSlots
      .filter(s => s.is_available)
      .forEach(s => {
        const t = s.start_time.substring(11, 16);
        availableSlotByTime[t] = s;
      });

    const result: SlotItem[] = [];
    let t = openMins;
    while (t < closeMins - 89) { // last start must leave at least 90min
      const time = minsToHHMM(t);
      const end90 = t + 90;
      const end120 = t + 120;

      const conflicts90 = bookedIntervals.some(b => b.startMins < end90 && b.endMins > t);
      const conflicts120 = bookedIntervals.some(b => b.startMins < end120 && b.endMins > t);

      // Find if this time has a game (from any slot — available or not)
      const matchedSlot = bookedSlots.find(s => s.start_time.substring(11, 16) === time);
      const hasGame = matchedSlot ? (matchedSlot.id in gameBySlotId) : false;
      const gameId = matchedSlot ? gameBySlotId[matchedSlot.id] : undefined;

      // Use price_override from batch slot if present, otherwise fall back to schedule price
      const batchSlot = availableSlotByTime[time];
      const pricePerHour = batchSlot?.price_override ?? schedulePrice;

      result.push({
        id: `dyn_${date}_${time}`,
        time,
        endTime90: minsToHHMM(end90),
        endTime120: minsToHHMM(end120),
        available90: !conflicts90,
        available120: end120 <= closeMins && !conflicts120,
        pricePerHour,
        hasGame,
        gameId,
        isDynamic: true,
      });

      t += 30;
    }
    return result;
  }

  function generateFromPreCreatedSlots(
    schedule: CourtSchedule | null,
    allSlots: any[],
    date: string,
    gameBySlotId: Record<string, string>,
    fallbackPrice: number,
  ): SlotItem[] {
    const now = new Date();
    const availableSlots = allSlots.filter(s => s.is_available && new Date(s.start_time) > now);

    const bookedIntervals = allSlots
      .filter(s => !s.is_available)
      .map(s => ({
        startMins: timeToMins(s.start_time.substring(11, 16)),
        endMins: s.end_time
          ? timeToMins(s.end_time.substring(11, 16))
          : timeToMins(s.start_time.substring(11, 16)) + 30,
      }));

    const closeMins = schedule ? timeToMins(schedule.close_time) : 24 * 60;

    return availableSlots
      .map(slot => {
        const time = slot.start_time.substring(11, 16);
        const startMins = timeToMins(time);
        const end90 = startMins + 90;
        const end120 = startMins + 120;

        const conflicts90 = bookedIntervals.some(b => b.startMins < end90 && b.endMins > startMins);
        const conflicts120 = bookedIntervals.some(b => b.startMins < end120 && b.endMins > startMins);

        const anySlotAtTime = allSlots.find(s => s.start_time.substring(11, 16) === time);
        const hasGame = anySlotAtTime ? (anySlotAtTime.id in gameBySlotId) : false;
        const gameId = anySlotAtTime ? gameBySlotId[anySlotAtTime.id] : undefined;

        return {
          id: slot.id,
          time,
          endTime90: minsToHHMM(end90),
          endTime120: minsToHHMM(end120),
          available90: !conflicts90,
          available120: end120 <= closeMins && !conflicts120,
          pricePerHour: slot.price_override ?? schedule?.price ?? fallbackPrice,
          hasGame,
          gameId,
          isDynamic: false,
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  function timeToMins(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function minsToHHMM(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  useEffect(() => {
    setSelectedSlot(null);
    fetchSlots(venueCourts, selectedDate);
  }, [selectedDate, venueCourts]);

  // Realtime: re-fetch when gestor changes availability or cancels a booking
  useEffect(() => {
    if (!venueCourts.length) return;
    const refresh = () => {
      setSelectedSlot(null);
      fetchSlotsRef.current();
    };
    const channel = supabase
      .channel(`court-details-slots-${venueCourts.map(c => c.id).join('-')}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [venueCourts]);

  // Re-fetch when user returns to this tab
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchSlotsRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ── Open games: fetch for selected date across venue courts ─
  useEffect(() => {
    if (!venueCourts.length) return;
    setSelectedOpenSlot(null);
    supabase
      .from('games')
      .select('id, court_id, slot_id, price_per_player, max_players, current_players, skill_level, scheduled_at')
      .in('court_id', venueCourts.map(c => c.id))
      .eq('is_open', true)
      .gte('scheduled_at', `${selectedDate}T00:00:00`)
      .lte('scheduled_at', `${selectedDate}T23:59:59`)
      .then(({ data }) => {
        const bySlot: Record<string, any> = {};
        (data ?? []).forEach(g => { if (g.slot_id) bySlot[g.slot_id] = g; });
        setOpenGamesBySlot(bySlot);
      });
  }, [selectedDate, venueCourts]);

  // ── Slot selection ────────────────────────────────────────
  function handleSlotSelect(slot: SlotItem, courtId: string, courtName: string) {
    const isAvailable = selectedDuration === 90 ? slot.available90 : slot.available120;
    if (!isAvailable || slot.hasGame) return;
    const endTime = selectedDuration === 90 ? slot.endTime90 : slot.endTime120;
    const price = slot.pricePerHour * (selectedDuration / 60);
    setSelectedSlot({
      slotId: slot.isDynamic ? '' : slot.id,
      courtId,
      courtName,
      time: slot.time,
      endTime,
      price,
      pricePerHour: slot.pricePerHour,
      isDynamic: slot.isDynamic,
    });
    setTimeout(() => slotPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  function handleCreateOpenGame() {
    if (!selectedOpenSlot) return;
    const pricePerPlayer = selectedOpenSlot.price / OPEN_MIN_PLAYERS;
    const courtSport = venueCourts.find(c => c.id === selectedOpenSlot.courtId)?.sport_type ?? '';
    navigate('/open-game-review', {
      state: {
        slotId: selectedOpenSlot.slotId,
        courtId: selectedOpenSlot.courtId,
        courtName: selectedOpenSlot.courtName,
        courtSport,
        venueName: court.venueName,
        date: selectedDate,
        time: selectedOpenSlot.time,
        endTime: selectedOpenSlot.endTime,
        totalPrice: selectedOpenSlot.price,
        maxPlayers: OPEN_MAX_PLAYERS,
        minPlayers: OPEN_MIN_PLAYERS,
        pricePerPlayer,
      },
    });
  }

  const totalAvailable = Object.values(slotsByCourt).flat().filter(s => s.available90 && !s.hasGame).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-6">

      {/* Image Gallery */}
      <div className="relative bg-black">
        <img src={court.images[currentImageIndex]} alt={court.name} className="w-full h-72 object-cover" />
        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 bg-white text-gray-900 p-2 rounded-full shadow-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="absolute top-4 right-4 flex gap-2">
          <button className="bg-white text-gray-900 p-2 rounded-full shadow-lg"><Share2 className="w-5 h-5" /></button>
          <button className="bg-white text-gray-900 p-2 rounded-full shadow-lg"><Heart className="w-5 h-5" /></button>
        </div>
        {court.images.length > 1 && (
          <>
            <button onClick={() => setCurrentImageIndex(p => (p - 1 + court.images.length) % court.images.length)}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 p-2 rounded-full shadow-lg">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button onClick={() => setCurrentImageIndex(p => (p + 1) % court.images.length)}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 p-2 rounded-full shadow-lg">
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
          {court.images.map((_: string, idx: number) => (
            <button key={idx} onClick={() => setCurrentImageIndex(idx)}
              className={`w-2 h-2 rounded-full transition-all ${idx === currentImageIndex ? 'bg-white w-6' : 'bg-white/60'}`} />
          ))}
        </div>
      </div>

      {/* Venue / Court header */}
      <div className="bg-white px-6 py-4 border-b border-gray-200">
        {court.venueName && (
          <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-0.5">{court.venueName}</p>
        )}
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{court.name}</h1>
        <div className="flex items-center gap-4">
          {court.rating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold text-sm">{court.rating}</span>
              <span className="text-gray-400 text-xs">({court.reviews})</span>
            </div>
          )}
          {venue?.address && (
            <div className="flex items-center gap-1 text-gray-500">
              <MapPin className="w-4 h-4" />
              <span className="text-sm">{venue.city || venue.address}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="flex overflow-x-auto">
          {(['home', 'book', 'open-games', 'classes'] as TabType[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 px-6 py-4 font-semibold transition-colors border-b-2 ${
                activeTab === tab ? 'text-violet-600 border-violet-600' : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}>
              {tab === 'home' ? 'Home' : tab === 'book' ? 'Agendar' : tab === 'open-games' ? 'Jogos Abertos' : 'Aulas'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">

        {/* ── HOME TAB ── */}
        {activeTab === 'home' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="font-bold text-gray-900 mb-3 text-lg">Sobre</h2>
              {venue?.description
                ? <p className="text-gray-600 text-sm mb-4">{venue.description}</p>
                : <p className="text-gray-400 text-sm mb-4 italic">Sem descrição cadastrada.</p>
              }
              <div className="space-y-3">
                {venue?.address && (
                  <div className="flex items-center gap-3 text-gray-700">
                    <MapPin className="w-5 h-5 text-violet-600 flex-shrink-0" />
                    <span className="text-sm">{venue.address}{venue.city ? `, ${venue.city}` : ''}</span>
                  </div>
                )}
                {venue?.phone && (
                  <div className="flex items-center gap-3 text-gray-700">
                    <Phone className="w-5 h-5 text-violet-600 flex-shrink-0" />
                    <span className="text-sm">{venue.phone}</span>
                  </div>
                )}
                {venue?.email && (
                  <div className="flex items-center gap-3 text-gray-700">
                    <Mail className="w-5 h-5 text-violet-600 flex-shrink-0" />
                    <span className="text-sm">{venue.email}</span>
                  </div>
                )}
                {venue?.opening_hours && (
                  <div className="flex items-center gap-3 text-gray-700">
                    <Clock className="w-5 h-5 text-violet-600 flex-shrink-0" />
                    <span className="text-sm">{venue.opening_hours}</span>
                  </div>
                )}
              </div>
            </div>

            {court.amenities.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h2 className="font-bold text-gray-900 mb-4 text-lg">Comodidades</h2>
                <div className="flex flex-wrap gap-2">
                  {court.amenities.map((a: string) => (
                    <span key={a} className="px-4 py-2 bg-violet-50 text-violet-700 rounded-full text-sm font-medium">{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BOOK TAB ── */}
        {activeTab === 'book' && (
          <div className="space-y-4">

            {/* Week strip */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div ref={weekScrollRef} className="flex gap-2 overflow-x-auto px-4 py-4" style={{ scrollbarWidth: 'none' }}>
                {weekDays.map(day => {
                  const isSelected = day.date === selectedDate;
                  return (
                    <button key={day.date} onClick={() => setSelectedDate(day.date)}
                      className="flex-shrink-0 flex flex-col items-center gap-1">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{day.dayLabel}</span>
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-base transition-all ${
                        isSelected ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      }`}>
                        {day.dayNum}
                      </div>
                      <span className="text-xs text-gray-400">{day.monthLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration + toggle row */}
            <div className="flex items-center justify-between px-1 gap-3">
              {/* Duration picker */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 font-medium">Duração:</span>
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  {([90, 120] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => { setSelectedDuration(d); setSelectedSlot(null); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${selectedDuration === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                    >
                      {d === 90 ? '1h30' : '2h'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Available only toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Só livres</span>
                <button onClick={() => setShowAvailableOnly(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${showAvailableOnly ? 'bg-gray-900' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showAvailableOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Loading */}
            {loadingSlots ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : venueCourts.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
                <p className="text-sm">Nenhuma quadra cadastrada neste clube.</p>
              </div>
            ) : Object.values(slotsByCourt).every(s => s.length === 0) ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center space-y-2">
                <p className="text-4xl">📅</p>
                <p className="font-semibold text-gray-700">Nenhum horário disponível</p>
                <p className="text-sm text-gray-400">Não há horários cadastrados para este dia.<br />Tente selecionar outra data.</p>
              </div>
            ) : totalAvailable === 0 && showAvailableOnly ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center space-y-2">
                <p className="text-4xl">📅</p>
                <p className="font-semibold text-gray-700">Nenhum horário livre</p>
                <p className="text-sm text-gray-400">Todos os horários estão ocupados neste dia.<br />Tente outra data.</p>
              </div>
            ) : (
              /* One block per court */
              venueCourts.map(c => {
                const allSlots = slotsByCourt[c.id] ?? [];
                const slots = allSlots.filter(s =>
                  showAvailableOnly ? (selectedDuration === 90 ? s.available90 : s.available120) : true
                );

                if (slots.length === 0) return null;

                const sportLbl = c.sport_type ? sportLabel(c.sport_type) : '';
                const schedule = courtSchedules[c.id];
                const basePrice = schedule?.price ?? c.price_per_hour;
                const slotPrice = basePrice * (selectedDuration / 60);

                return (
                  <div key={c.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    {/* Court block header */}
                    <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                      <div>
                        <h3 className="font-bold text-gray-900">{c.name}</h3>
                        {sportLbl && (
                          <span className="text-xs text-gray-500">{sportLbl}</span>
                        )}
                      </div>
                    </div>

                    {/* Slots grid */}
                    <div className="p-4">
                      {slots.length === 0 ? (
                        <p className="text-center text-sm text-gray-400 py-4">
                          Sem horários para esta data.
                        </p>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {slots.map(slot => {
                            const isSelected = selectedSlot?.time === slot.time && selectedSlot?.courtId === c.id;
                            const isAvailable = selectedDuration === 90 ? slot.available90 : slot.available120;
                            return (
                              <button
                                key={slot.id}
                                onClick={() => {
                                  if (slot.hasGame && slot.gameId) {
                                    navigate(`/game-details/${slot.gameId}`);
                                  } else {
                                    handleSlotSelect(slot, c.id, c.name);
                                  }
                                }}
                                disabled={!isAvailable && !slot.hasGame}
                                className={`py-2 px-1 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center gap-0.5 ${
                                  isSelected
                                    ? 'bg-gray-900 text-white border-gray-900'
                                    : slot.hasGame
                                      ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                                      : isAvailable
                                        ? 'bg-white text-gray-900 border-gray-200 hover:border-gray-400'
                                        : 'bg-transparent border-transparent text-gray-300 line-through cursor-not-allowed'
                                }`}
                              >
                                <span>{slot.time}</span>
                                {slot.hasGame && <span className="text-[9px] font-bold text-violet-500">Jogo</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* CTA — private game setup panel */}
            {selectedSlot && (
              <div ref={slotPanelRef} className="bg-white rounded-2xl shadow-sm p-5 border-2 border-violet-500 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Lock className="w-3.5 h-3.5 text-violet-600" />
                      <p className="text-xs font-bold text-violet-600 uppercase tracking-wide">Nova Partida Privada</p>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {selectedSlot.time} – {selectedSlot.endTime}
                      <span className="text-sm font-normal text-gray-400 ml-2">{selectedDuration === 90 ? '1h30' : '2h'}</span>
                    </p>
                    <p className="text-sm text-gray-500">{selectedSlot.courtName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">R$ {selectedSlot.price.toFixed(0)}</p>
                    <p className="text-xs text-gray-400">quadra · {selectedDuration === 90 ? '1h30' : '2h'}</p>
                  </div>
                </div>

                {/* Payment mode */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Como deseja pagar?</p>
                  <div className="space-y-2">
                    <button
                      onClick={() => setPrivatePayMode('full')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${privatePayMode === 'full' ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${privatePayMode === 'full' ? 'border-violet-600 bg-violet-600' : 'border-gray-300'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900">Pagar tudo</p>
                        <p className="text-xs text-gray-500">Você cobre o valor completo da quadra</p>
                      </div>
                      <span className="text-sm font-bold text-gray-900 flex-shrink-0">R$ {selectedSlot.price.toFixed(0)}</span>
                    </button>
                    <button
                      onClick={() => setPrivatePayMode('split')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${privatePayMode === 'split' ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${privatePayMode === 'split' ? 'border-violet-600 bg-violet-600' : 'border-gray-300'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900">Dividir com o grupo</p>
                        <p className="text-xs text-gray-500">Cada jogador paga sua parte</p>
                      </div>
                      <span className="text-sm font-bold text-gray-900 flex-shrink-0">
                        R$ {(selectedSlot.price / 10).toFixed(2)}<span className="text-xs font-normal text-gray-500">/pessoa</span>
                      </span>
                    </button>

                    {privatePayMode === 'split' && (
                      <div className="bg-blue-50 rounded-xl p-3.5 border border-blue-100 space-y-2">
                        <p className="text-sm text-blue-900 leading-relaxed">
                          A quadra abre para até <strong>18 jogadores</strong>. Cada um autoriza{' '}
                          <strong>R$ {((selectedSlot.price / 10) * 1.08 + 2.50).toFixed(2)}</strong> no cartão — quanto mais jogadores entrarem, menos cada um paga.
                        </p>
                        <p className="text-sm text-blue-900 leading-relaxed">
                          12 horas antes do jogo o valor é ajustado e cobrado automaticamente.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setSelectedSlot(null)}
                    className="px-4 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => navigate('/private-game-review', {
                      state: {
                        slotId: selectedSlot.slotId,
                        price: selectedSlot.price,
                        time: selectedSlot.time,
                        endTime: selectedSlot.endTime,
                        startTime: `${selectedDate}T${selectedSlot.time}:00`,
                        endTimeISO: `${selectedDate}T${selectedSlot.endTime}:00`,
                        duration: selectedDuration,
                        courtId: selectedSlot.courtId,
                        courtName: selectedSlot.courtName,
                        venueName: court.venueName,
                        date: selectedDate,
                        maxPlayers: PRIVATE_MAX_PLAYERS,
                        payMode: privatePayMode,
                        courtSport: venueCourts.find(c => c.id === selectedSlot.courtId)?.sport_type ?? '',
                        isDynamic: selectedSlot.isDynamic,
                      },
                    })}
                    className="flex-1 bg-violet-600 text-white py-3 rounded-xl font-bold text-base hover:bg-violet-700 transition-colors"
                  >
                    Ver revisão →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── OPEN GAMES TAB ── */}
        {activeTab === 'open-games' && (
          <div className="space-y-4">

            {/* Date strip (shared) */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex gap-2 overflow-x-auto px-4 py-4" style={{ scrollbarWidth: 'none' }}>
                {weekDays.map(day => {
                  const isSelected = day.date === selectedDate;
                  return (
                    <button key={day.date} onClick={() => setSelectedDate(day.date)}
                      className="flex-shrink-0 flex flex-col items-center gap-1">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{day.dayLabel}</span>
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-base transition-all ${
                        isSelected ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      }`}>{day.dayNum}</div>
                      <span className="text-xs text-gray-400">{day.monthLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Slot grid per court */}
            {loadingSlots ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : venueCourts.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
                <p className="text-sm">Nenhuma quadra cadastrada neste clube.</p>
              </div>
            ) : Object.values(slotsByCourt).every(s => s.length === 0) ? (
              <div className="bg-white rounded-2xl shadow-sm p-10 text-center space-y-2">
                <p className="text-4xl">😔</p>
                <p className="font-semibold text-gray-700">Nenhum horário disponível</p>
                <p className="text-sm text-gray-400">Não há slots cadastrados para este dia.<br />Tente outra data.</p>
              </div>
            ) : (
              venueCourts.map(c => {
                const slots = slotsByCourt[c.id] ?? [];
                if (slots.length === 0) return null;
                const schedule = courtSchedules[c.id];
                const basePrice = schedule?.price ?? c.price_per_hour;
                return (
                  <div key={c.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                      <div>
                        <h3 className="font-bold text-gray-900">{c.name}</h3>
                        {c.sport_type && <span className="text-xs text-gray-500">{sportLabel(c.sport_type)}</span>}
                      </div>
                      <span className="text-sm font-semibold text-violet-600">a partir de R$ {basePrice}/h</span>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-4 gap-2">
                        {slots.map(slot => {
                          const game = openGamesBySlot[slot.id];
                          const isSelected = selectedOpenSlot?.slotId === slot.id;
                          const spotsLeft = game ? game.max_players - game.current_players : null;
                          const isFull = game && spotsLeft === 0;
                          const slotAvailable = slot.available90;
                          const slotPrice = slot.pricePerHour * (90 / 60);

                          return (
                            <button
                              key={slot.id}
                              onClick={() => {
                                if (game && !isFull) {
                                  navigate(`/game-details/${game.id}`);
                                } else if (!game && slotAvailable) {
                                  setSelectedOpenSlot(isSelected ? null : {
                                    slotId: slot.isDynamic ? '' : slot.id,
                                    courtId: c.id,
                                    courtName: c.name,
                                    time: slot.time,
                                    endTime: slot.endTime90,
                                    price: slotPrice,
                                    pricePerHour: slot.pricePerHour,
                                    isDynamic: slot.isDynamic,
                                  });
                                }
                              }}
                              disabled={(!slotAvailable && !game) || !!isFull}
                              className={`py-3 px-1 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center gap-0.5 ${
                                isSelected
                                  ? 'bg-gray-900 text-white border-gray-900'
                                  : game && !isFull
                                  ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                                  : isFull
                                  ? 'bg-gray-100 text-gray-300 border-transparent cursor-not-allowed'
                                  : slotAvailable
                                  ? 'bg-white text-gray-900 border-gray-200 hover:border-gray-400'
                                  : 'bg-transparent border-transparent text-gray-300 line-through cursor-not-allowed'
                              }`}
                            >
                              <span>{slot.time}</span>
                              {game && !isFull && (
                                <span className="text-[10px] font-bold">{spotsLeft} vaga{spotsLeft !== 1 ? 's' : ''}</span>
                              )}
                              {isFull && <span className="text-[10px]">Cheio</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Slot legend */}
            {!loadingSlots && venueCourts.length > 0 && (
              <div className="flex items-center gap-4 px-1 text-xs text-gray-400">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded border border-gray-200 bg-white" />Disponível</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded border border-violet-200 bg-violet-50" />Partida aberta</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded border-transparent bg-transparent" /><span className="line-through">Ocupado</span></div>
              </div>
            )}

            {/* Create open game panel */}
            {selectedOpenSlot && (
              <div className="bg-white rounded-2xl shadow-sm border-2 border-gray-900 overflow-hidden">
                {/* Header */}
                <div className="bg-gray-900 text-white px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-1">Nova partida aberta</p>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold">{selectedOpenSlot.time}</p>
                      <p className="text-sm opacity-70 mt-0.5">{selectedOpenSlot.courtName} · {new Date(selectedDate).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">R$ {(selectedOpenSlot.price / OPEN_MIN_PLAYERS).toFixed(2)}</p>
                      <p className="text-xs opacity-60">por jogador</p>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  {/* Summary */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Valor total da quadra</span>
                      <span className="font-semibold text-gray-900">R$ {selectedOpenSlot.price}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Dividido por {OPEN_MIN_PLAYERS} jogadores (mínimo)</span>
                      <span className="font-semibold text-gray-900">= R$ {(selectedOpenSlot.price / OPEN_MIN_PLAYERS).toFixed(2)}/pessoa</span>
                    </div>
                    <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900">
                      <span>Você paga agora</span>
                      <span className="text-violet-600">R$ {(selectedOpenSlot.price / OPEN_MIN_PLAYERS).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Spots preview */}
                  <div>
                    <p className="text-xs text-gray-500 mb-2">{OPEN_MAX_PLAYERS - 1} vagas abertas para outros jogadores</p>
                    <div className="flex gap-2">
                      {Array.from({ length: OPEN_MAX_PLAYERS }).map((_, i) => (
                        <div key={i} className={`flex-1 h-1.5 rounded-full ${i === 0 ? 'bg-gray-900' : 'bg-gray-200'}`} />
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setSelectedOpenSlot(null)}
                      className="px-4 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreateOpenGame}
                      className="flex-1 bg-gray-900 text-white py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                    >
                      Revisar partida
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CLASSES TAB ── */}
        {activeTab === 'classes' && (
          <div className="text-center py-10 text-gray-500">
            <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm">Nenhuma aula disponível nesta quadra.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourtDetails;
