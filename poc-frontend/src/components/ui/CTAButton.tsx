import React from 'react';
import { LucideIcon } from 'lucide-react';
import styled from 'styled-components';

interface CTAButtonProps {
  text: string;
  variant?: 'primary' | 'secondary';
  icon?: React.ReactElement<LucideIcon>;
  onClick?: () => void;
}

const CTAButton = ({ text, variant = 'primary', icon, onClick }: CTAButtonProps) => {
  return (
    <StyledWrapper $variant={variant}>
      <button className="button type1" onClick={onClick}>
        <span className="btn-txt">
          {text}
          {icon && <span className="icon">{icon}</span>}
        </span>
      </button>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div<{ $variant: 'primary' | 'secondary' }>`
  .button {
    height: 50px;
    min-width: 200px;
    padding: 0 24px;
    position: relative;
    background-color: transparent;
    cursor: pointer;
    border: 2px solid ${props => props.$variant === 'primary' ? '#F97316' : '#EA580C'};
    overflow: hidden;
    border-radius: 30px;
    color: ${props => props.$variant === 'primary' ? '#F97316' : '#EA580C'};
    transition: all 0.5s ease-in-out;
  }

  .btn-txt {
    z-index: 1;
    font-weight: 600;
    letter-spacing: 1px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .icon {
    display: flex;
    align-items: center;
  }

  .type1::after {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    transition: all 0.5s ease-in-out;
    background-color: ${props => props.$variant === 'primary' ? '#F97316' : '#EA580C'};
    border-radius: 30px;
    visibility: hidden;
    height: 10px;
    width: 10px;
    z-index: -1;
  }

  .button:hover {
    box-shadow: 1px 1px 200px ${props => props.$variant === 'primary' ? '#F97316' : '#EA580C'};
    color: #fff;
    border: none;
  }

  .type1:hover::after {
    visibility: visible;
    transform: scale(100) translateX(2px);
  }
`;

export default CTAButton;
