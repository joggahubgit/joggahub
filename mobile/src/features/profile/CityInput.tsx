// Native port of src/app/components/CityInput.tsx (web): "Cidade" field with
// suggestions from the IBGE list, always saved as "Nome, UF".
// Suggestions render inline under the field (not floating) so they are never
// clipped by the ScrollView; the screen's ScrollView needs
// keyboardShouldPersistTaps="handled" so a tap picks a city with the keyboard open.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, TextInput, View } from 'react-native';
import { LocateFixed, MapPin } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { canonicalCity, searchCities, type City } from '@/lib/shared';
import { getCities } from './cities';
import { detectCity } from './detectCity';
import palette from '../../../tailwind.palette';

const inputStyle = { fontFamily: 'Inter_400Regular' };

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** true when value is a city from the list ("Nome, UF") */
  onValidChange?: (valid: boolean) => void;
  /** vertical padding of the field, to match each screen ("py-3" / "py-3.5") */
  paddingClassName?: string;
}

export function CityInput({ value, onChange, onValidChange, paddingClassName = 'py-3' }: Props) {
  const cities = useMemo(getCities, []);
  const [focused, setFocused] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  const valid = useMemo(() => cities.some(c => c.label === value), [cities, value]);
  useEffect(() => { onValidChange?.(valid); }, [valid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Old free-text values ("campinas") become "Campinas, SP" right away
  useEffect(() => {
    if (!value || valid) return;
    const fixed = canonicalCity(cities, value);
    if (fixed && fixed !== value) onChange(fixed);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = focused && !valid ? searchCities(cities, value, 5) : [];

  // Latest text, also set by pick(): the blur that follows a pick still sees
  // the typed text in `value` ("santos") and would overwrite the chosen city.
  const latest = useRef(value);
  latest.current = value;

  function pick(city: City) {
    latest.current = city.label;
    onChange(city.label);
    setError('');
    Keyboard.dismiss();
  }

  function handleBlur() {
    setFocused(false);
    const text = latest.current;
    if (!text || cities.some(c => c.label === text)) return;
    const fixed = canonicalCity(cities, text);
    if (fixed) onChange(fixed);
  }

  async function locate() {
    setLocating(true);
    setError('');
    try {
      const found = await detectCity();
      const fixed = canonicalCity(cities, found);
      if (fixed) onChange(fixed);
      else setError(`Não reconhecemos "${found}" como cidade do Brasil. Digite o nome da sua cidade.`);
    } catch (e) {
      setError((e as Error)?.message ?? 'Não foi possível identificar sua cidade.');
    } finally {
      setLocating(false);
    }
  }

  const showHint = !focused && !!value.trim() && !valid && !error;

  return (
    <View>
      <View className={`flex-row items-center border-2 rounded-xl pr-3 ${focused ? 'border-violet-600' : 'border-gray-200'}`}>
        <TextInput
          value={value}
          onChangeText={t => {
            onChange(t);
            setError('');
          }}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder="Digite sua cidade"
          placeholderTextColor={palette.gray['400']}
          maxLength={80}
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="done"
          onSubmitEditing={() => { if (suggestions[0]) pick(suggestions[0]); }}
          className={`flex-1 px-4 ${paddingClassName} text-base text-gray-900`}
          style={inputStyle}
        />
        <Pressable onPress={locate} disabled={locating} accessibilityLabel="Usar minha localização" hitSlop={8}>
          {locating ? <ActivityIndicator size="small" color={palette.violet['600']} /> : <LocateFixed size={20} color={palette.violet['600']} />}
        </Pressable>
      </View>

      {suggestions.length > 0 && (
        <View className="mt-1.5 bg-white border-2 border-gray-100 rounded-xl overflow-hidden">
          {suggestions.map((c, i) => (
            <Pressable
              key={c.label}
              onPress={() => pick(c)}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              className={`flex-row items-center gap-3 px-4 py-3 active:bg-violet-50 ${i > 0 ? 'border-t border-gray-100' : ''}`}
            >
              <MapPin size={16} color={palette.violet['500']} />
              <Text className="flex-1 text-base text-gray-900">{c.name}</Text>
              <Text className="text-sm text-gray-400">{c.uf}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!!error && <Text className="text-xs text-red-500 mt-1.5">{error}</Text>}
      {showHint && <Text className="text-xs text-amber-600 mt-1.5">Escolha sua cidade na lista de sugestões.</Text>}
    </View>
  );
}
