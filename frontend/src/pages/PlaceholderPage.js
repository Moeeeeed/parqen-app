import React from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import {
  HelpCircle, ChevronRight, LayoutTemplate,
} from 'lucide-react';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mist:'#F0FAF5',
  g50:'#F8FAFC', g200:'#E2E8F0', g400:'#94A3B8', g600:'#475569', g800:'#1E293B',
};

function PlaceholderPage({ title, description, icon: Icon, overrideColor }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: C.mist, fontFamily: "'DM Sans',sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 py-12 text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: `${overrideColor || C.green}15` }}
        >
          {Icon ? (
            <Icon size={40} style={{ color: overrideColor || C.green }} strokeWidth={1.8} />
          ) : (
            <HelpCircle size={40} style={{ color: C.green }} strokeWidth={1.8} />
          )}
        </div>

        <h1
          className="font-black text-2xl mb-3"
          style={{ color: C.forest, fontFamily: "'Syne',sans-serif" }}
        >
          {title}
        </h1>

        <p className="text-sm leading-relaxed mb-8" style={{ color: C.g600 }}>
          {description}
        </p>

        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 px-6 py-3 rounded-xl font-bold text-sm text-white transition"
          style={{ backgroundColor: C.green }}
        >
          Go back <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

PlaceholderPage.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  icon: PropTypes.elementType,
  overrideColor: PropTypes.string,
};

export default PlaceholderPage;
