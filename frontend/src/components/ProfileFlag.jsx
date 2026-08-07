import { useState, useEffect } from 'react';
import { BadgeChip } from '../lib/badge';

function ProfileFlag({ user }) {
  const [countryData, setCountryData] = useState({ code: null, name: null });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        setCountryData({
          code: data.country_code?.toLowerCase(),
          name: data.country_name
        });
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error fetching location:', err);
        setIsLoading(false);
      });
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
    </div>
  );
}

export default ProfileFlag;