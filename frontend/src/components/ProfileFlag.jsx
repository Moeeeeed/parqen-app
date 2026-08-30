import { useState, useEffect } from 'react';
import { API_URL } from '../App';
import { BadgeChip, SafetyBadge } from '../lib/badge';

function ProfileFlag({ user }) {
  const [countryData, setCountryData] = useState({ code: null, name: null });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL.replace('/api','')}/api/geo/detect`)
      .then(res => res.json())
      .then(data => {
        if (data.countryCode) {
          setCountryData({ code: data.countryCode.toLowerCase(), name: data.city || data.countryCode });
        }
        setIsLoading(false);
      })
      .catch(() => { setIsLoading(false); });
  }, []);

  // Use emoji flag for country
  const flagEmoji = countryData.code ? String.fromCodePoint(...[...countryData.code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '🌍';

  return (
    <div className="flex items-center gap-2">
      {isLoading ? (
        <span className="text-gray-400">...</span>
      ) : countryData.code ? (
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{flagEmoji}</span>
          <span className="text-sm text-gray-600 font-medium">{countryData.name}</span>
        </div>
      ) : null}
      {user && <BadgeChip user={user} size="sm" />}
      {user && <SafetyBadge user={user} size="sm" />}
    </div>
  );
}

export default ProfileFlag;