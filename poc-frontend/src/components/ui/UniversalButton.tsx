import React from 'react';
import styled from 'styled-components';
import { Loader2, BarChart2 } from "lucide-react";

interface ScanButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  text?: string;
  icon?: React.ReactNode;
  className?: string;
  href?: string;
  variant?: 'primary' | 'secondary';
}

const ScanButton: React.FC<ScanButtonProps> = ({ 
  onClick, 
  disabled, 
  loading,
  text = "Scan",
  icon,
  className = '',
  href,
  variant = 'primary'
}) => {
  const ButtonContent = () => (
    <>
      {loading ? (
        <Loader2 className="svgIcon animate-spin" />
      ) : (
        icon ?? <BarChart2 className="svgIcon" />
      )}
      <span>{text}</span>
    </>
  );

  return (
    <StyledWrapper className={className} variant={variant}>
      {href ? (
        <a href={href} className="Btn" onClick={onClick}>
          <ButtonContent />
        </a>
      ) : (
        <button className="Btn" onClick={onClick} disabled={disabled}>
          <ButtonContent />
        </button>
      )}
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div<{ variant: 'primary' | 'secondary' }>`
  .Btn {
    min-width: 150px;  
    width: auto;
    padding: 0 1rem;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 2px solid ${props => props.variant === 'primary' ? '#f97316' : '#3b82f6'};
    color: ${props => props.variant === 'primary' ? '#f97316' : '#3b82f6'};
    font-weight: 600;
    gap: 8px;
    cursor: pointer;
    box-shadow: 5px 5px 10px ${props => props.variant === 'primary' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(59, 130, 246, 0.1)'};
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
    border-radius: 0.375rem;
    z-index: 1;
    white-space: nowrap;
    text-decoration: none;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      border-color: ${props => props.variant === 'primary' ? '#fdba74' : '#93c5fd'};
      color: ${props => props.variant === 'primary' ? '#fdba74' : '#93c5fd'};
    }
  }

  .svgIcon {
    width: 16px;
    height: 16px;
    color: ${props => props.variant === 'primary' ? '#f97316' : '#3b82f6'};
    transition: all 0.3s ease;
    position: relative;
    z-index: 2;
    flex-shrink: 0;
  }

  .Btn::before {
    content: "";
    position: absolute;
    left: -100%;
    top: 0;
    width: 100%;
    height: 100%;
    background: ${props => props.variant === 'primary' 
      ? 'linear-gradient(to right, #f97316, #ea580c)'
      : 'linear-gradient(to right, #3b82f6, #2563eb)'};
    transition: all 0.3s ease;
    z-index: 1;
  }

  .Btn:hover:not(:disabled) {
    color: white;
    border-color: ${props => props.variant === 'primary' ? '#ea580c' : '#2563eb'};
  }

  .Btn:hover:not(:disabled)::before {
    left: 0;
  }

  .Btn:hover:not(:disabled) .svgIcon {
    color: white;
  }

  .Btn:active:not(:disabled) {
    transform: translate(2px, 2px);
    box-shadow: 3px 3px 8px ${props => props.variant === 'primary' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)'};
  }

  .Btn span {
    position: relative;
    z-index: 2;
  }
`;

export default ScanButton;
