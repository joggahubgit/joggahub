import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export default function GameDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  useEffect(() => {
    navigate(`/open-game/${id}`, { replace: true });
  }, [id]);

  return null;
}
