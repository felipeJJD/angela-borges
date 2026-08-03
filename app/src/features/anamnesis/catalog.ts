export const ANGELA_ANAMNESIS_SCHEMA_VERSION = 'angela-anamnesis.v1' as const

export type AnamnesisSection = 'personal' | 'nutrition' | 'training'
export type AnamnesisStepType = 'single' | 'multi' | 'number' | 'date' | 'text'

export type AnamnesisOption = Readonly<{
  value: string
  label: string
}>

export type AnamnesisStepRules = Readonly<{
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  maxSelections?: number
  exclusiveOption?: string
  notFuture?: boolean
}>

export type AnamnesisStep = Readonly<{
  key: string
  section: AnamnesisSection
  type: AnamnesisStepType
  prompt: string
  helper?: string
  required: boolean
  unit?: string
  inputStep?: number
  options?: readonly AnamnesisOption[]
  rules?: AnamnesisStepRules
}>

export type AnamnesisCatalog = Readonly<{
  schemaVersion: typeof ANGELA_ANAMNESIS_SCHEMA_VERSION
  steps: readonly AnamnesisStep[]
}>

const catalogDefinition = {
  schemaVersion: ANGELA_ANAMNESIS_SCHEMA_VERSION,
  steps: [
    {
      key: 'birth_date',
      section: 'personal',
      type: 'date',
      prompt: 'Qual é a sua data de nascimento?',
      helper: 'Essa informação me ajuda a considerar cada fase da sua rotina.',
      required: true,
      rules: { notFuture: true },
    },
    {
      key: 'height_cm',
      section: 'personal',
      type: 'number',
      prompt: 'Qual é a sua altura hoje?',
      helper: 'Informe a medida em centímetros.',
      required: true,
      unit: 'cm',
      inputStep: 1,
      rules: { min: 120, max: 220 },
    },
    {
      key: 'weight_kg',
      section: 'personal',
      type: 'number',
      prompt: 'Qual é o seu peso atual?',
      helper: 'Informe a medida em quilogramas. Você poderá atualizar esse dado depois.',
      required: true,
      unit: 'kg',
      inputStep: 0.1,
      rules: { min: 35, max: 300 },
    },
    {
      key: 'nutrition_goal',
      section: 'nutrition',
      type: 'single',
      prompt: 'Qual é o seu principal objetivo com a alimentação?',
      helper: 'Escolha a opção que mais representa este momento.',
      required: true,
      options: [
        { value: 'weight_loss', label: 'Perder peso' },
        { value: 'muscle_gain', label: 'Ganhar massa muscular' },
        { value: 'general_health', label: 'Cuidar da saúde de forma geral' },
      ],
    },
    {
      key: 'meal_routine',
      section: 'nutrition',
      type: 'multi',
      prompt: 'Quais refeições fazem parte da sua rotina?',
      helper: 'Marque todas as opções que costumam acontecer no seu dia.',
      required: true,
      options: [
        { value: 'breakfast', label: 'Café da manhã' },
        { value: 'morning_snack', label: 'Lanche da manhã' },
        { value: 'lunch', label: 'Almoço' },
        { value: 'afternoon_snack', label: 'Lanche da tarde' },
        { value: 'dinner', label: 'Jantar' },
        { value: 'supper', label: 'Ceia' },
        { value: 'late_night_snack', label: 'Lanche da madrugada' },
      ],
    },
    {
      key: 'dietary_restrictions',
      section: 'nutrition',
      type: 'multi',
      prompt: 'Você tem alguma restrição alimentar?',
      helper: 'Pode marcar mais de uma. “Nenhuma” não pode ser combinada com outra opção.',
      required: true,
      options: [
        { value: 'none', label: 'Não tenho restrições' },
        { value: 'lactose_intolerance', label: 'Intolerância à lactose' },
        { value: 'gluten_intolerance', label: 'Intolerância ao glúten' },
        { value: 'other_allergies', label: 'Outras alergias ou intolerâncias' },
      ],
      rules: { exclusiveOption: 'none' },
    },
    {
      key: 'nutrition_challenge',
      section: 'nutrition',
      type: 'single',
      prompt: 'Qual é o seu maior desafio com a alimentação hoje?',
      helper: 'Escolha o ponto que mais interfere na sua rotina.',
      required: true,
      options: [
        { value: 'sweets', label: 'Consumo excessivo de doces' },
        { value: 'anxiety_compulsion', label: 'Ansiedade ou compulsão alimentar' },
        { value: 'alcohol', label: 'Consumo frequente de bebidas alcoólicas' },
        { value: 'overeating', label: 'Comer além da saciedade nas refeições' },
        { value: 'meal_planning', label: 'Dificuldade para escolher ou montar refeições' },
      ],
    },
    {
      key: 'health_history',
      section: 'nutrition',
      type: 'multi',
      prompt: 'Há alguma destas condições no seu histórico de saúde?',
      helper: 'Marque todas as opções aplicáveis. Esta resposta não substitui avaliação médica.',
      required: true,
      options: [
        { value: 'diabetes', label: 'Diabetes ou pré-diabetes' },
        { value: 'hypertension', label: 'Hipertensão' },
        { value: 'high_cholesterol', label: 'Colesterol alto' },
        { value: 'none', label: 'Nenhuma das anteriores' },
      ],
      rules: { exclusiveOption: 'none' },
    },
    {
      key: 'sleep_quality',
      section: 'nutrition',
      type: 'single',
      prompt: 'Como você avalia a qualidade do seu sono?',
      helper: 'Considere como você costuma acordar na maioria dos dias.',
      required: true,
      options: [
        { value: 'excellent', label: 'Excelente — 7 a 9 horas e sono reparador' },
        { value: 'good', label: 'Boa — 6 a 7 horas e acordo descansada' },
        { value: 'fair', label: 'Regular — 5 a 6 horas e acordo cansada' },
        { value: 'poor', label: 'Ruim — menos de 5 horas ou insônia frequente' },
      ],
    },
    {
      key: 'water_intake',
      section: 'nutrition',
      type: 'single',
      prompt: 'Quanta água você bebe por dia?',
      helper: 'Escolha a faixa que mais se aproxima da sua rotina atual.',
      required: true,
      options: [
        { value: 'under_1l', label: 'Menos de 1 litro' },
        { value: '1_to_1_5l', label: 'De 1 a 1,5 litro' },
        { value: '1_75_to_2l', label: 'De 1,75 a 2 litros' },
        { value: 'over_2l', label: 'Mais de 2 litros' },
      ],
    },
    {
      key: 'emotional_eating',
      section: 'nutrition',
      type: 'single',
      prompt: 'Com que frequência você come em resposta ao estresse, à ansiedade ou ao tédio?',
      required: true,
      options: [
        { value: 'never', label: 'Nunca' },
        { value: 'rarely', label: 'Raramente' },
        { value: 'often', label: 'Frequentemente' },
        { value: 'always', label: 'Sempre' },
      ],
    },
    {
      key: 'meal_preparation',
      section: 'nutrition',
      type: 'single',
      prompt: 'Quem prepara a maior parte das suas refeições?',
      required: true,
      options: [
        { value: 'self', label: 'Eu preparo' },
        { value: 'family', label: 'Uma pessoa da família' },
        { value: 'eats_out', label: 'Como fora na maior parte das vezes' },
        { value: 'delivery', label: 'Compro refeições prontas ou delivery' },
        { value: 'household_help', label: 'Uma profissional prepara em casa' },
      ],
    },
    {
      key: 'planned_supplements',
      section: 'nutrition',
      type: 'multi',
      prompt: 'Quais suplementos você pretende usar?',
      helper: 'Marque somente o que já faz parte do seu planejamento. A indicação deve ser profissional.',
      required: true,
      options: [
        { value: 'none', label: 'Não pretendo usar suplementos' },
        { value: 'whey_protein', label: 'Whey protein' },
        { value: 'creatine', label: 'Creatina' },
        { value: 'pre_workout', label: 'Pré-treino' },
        { value: 'omega_3', label: 'Ômega 3' },
        { value: 'multivitamin', label: 'Multivitamínico' },
      ],
      rules: { exclusiveOption: 'none' },
    },
    {
      key: 'sweet_craving_times',
      section: 'nutrition',
      type: 'multi',
      prompt: 'Em quais momentos do dia costuma aparecer vontade de comer doce?',
      helper: 'Marque todos os momentos que se repetem na sua rotina.',
      required: true,
      options: [
        { value: 'none', label: 'Não costumo sentir essa vontade' },
        { value: 'breakfast', label: 'Depois do café da manhã' },
        { value: 'morning_snack', label: 'Depois do lanche da manhã' },
        { value: 'lunch', label: 'Depois do almoço' },
        { value: 'afternoon_snack', label: 'Depois do lanche da tarde' },
        { value: 'dinner', label: 'Depois do jantar' },
        { value: 'supper', label: 'Depois da ceia' },
      ],
      rules: { exclusiveOption: 'none' },
    },
    {
      key: 'disliked_foods',
      section: 'nutrition',
      type: 'multi',
      prompt: 'Quais destes alimentos você não gosta?',
      helper: 'Marque todos os que você prefere não incluir no plano.',
      required: true,
      options: [
        { value: 'none', label: 'Gosto de todos estes alimentos' },
        { value: 'kale', label: 'Couve' },
        { value: 'eggplant', label: 'Berinjela' },
        { value: 'cucumber', label: 'Pepino' },
        { value: 'tomato', label: 'Tomate' },
        { value: 'onion', label: 'Cebola' },
        { value: 'garlic', label: 'Alho' },
        { value: 'pepper', label: 'Pimenta' },
        { value: 'carrot', label: 'Cenoura' },
        { value: 'broccoli', label: 'Brócolis' },
        { value: 'zucchini', label: 'Abobrinha' },
        { value: 'mushrooms', label: 'Cogumelos' },
        { value: 'peanuts', label: 'Amendoim' },
        { value: 'fish', label: 'Peixe' },
        { value: 'shrimp', label: 'Camarão' },
        { value: 'octopus', label: 'Polvo' },
        { value: 'squid', label: 'Lula' },
        { value: 'egg', label: 'Ovo' },
        { value: 'cheese', label: 'Queijo' },
        { value: 'milk', label: 'Leite' },
        { value: 'yogurt', label: 'Iogurte' },
        { value: 'whole_grain_bread', label: 'Pão integral' },
      ],
      rules: { exclusiveOption: 'none' },
    },
    {
      key: 'food_budget',
      section: 'nutrition',
      type: 'single',
      prompt: 'Quanto você consegue investir por mês na sua alimentação planejada?',
      helper: 'A faixa ajuda a manter as escolhas possíveis para a sua realidade.',
      required: true,
      options: [
        { value: 'up_to_200', label: 'Até R$ 200' },
        { value: '200_to_400', label: 'De R$ 200 a R$ 400' },
        { value: '400_to_600', label: 'De R$ 400 a R$ 600' },
        { value: 'over_600', label: 'Acima de R$ 600' },
      ],
    },
    {
      key: 'training_experience_level',
      section: 'training',
      type: 'single',
      prompt: 'Como você descreve sua experiência atual com exercícios?',
      required: true,
      options: [
        { value: 'beginner', label: 'Iniciante — nunca treinei com regularidade' },
        { value: 'basic', label: 'Básica — até 6 meses de treino' },
        { value: 'intermediate', label: 'Intermediária — de 6 meses a 2 anos' },
        { value: 'experienced', label: 'Experiente — mais de 2 anos de prática' },
      ],
    },
    {
      key: 'training_days_per_week',
      section: 'training',
      type: 'single',
      prompt: 'Quantos dias por semana você consegue reservar para treinar?',
      required: true,
      options: [
        { value: '1_2_days', label: '1 ou 2 dias por semana' },
        { value: '3_4_days', label: '3 ou 4 dias por semana' },
        { value: '5_6_days', label: '5 ou 6 dias por semana' },
        { value: 'every_day', label: 'Todos os dias da semana' },
      ],
    },
    {
      key: 'training_location',
      section: 'training',
      type: 'single',
      prompt: 'Onde você pretende realizar seus treinos?',
      required: true,
      options: [
        { value: 'gym', label: 'Academia' },
        { value: 'home_equipment', label: 'Em casa, com equipamentos básicos' },
        { value: 'outdoors', label: 'Ao ar livre, usando o peso do corpo' },
        { value: 'mixed', label: 'Em locais variados' },
      ],
    },
    {
      key: 'injuries_or_limitations',
      section: 'training',
      type: 'text',
      prompt: 'Há alguma lesão, dor ou limitação que eu precise considerar?',
      helper: 'Descreva com suas palavras. Se não houver, escreva “Nenhuma”.',
      required: true,
      rules: { minLength: 2, maxLength: 500 },
    },
    {
      key: 'preferred_exercises',
      section: 'training',
      type: 'multi',
      prompt: 'Quais tipos de exercício você mais gosta?',
      helper: 'Escolha até 2 opções.',
      required: true,
      options: [
        { value: 'strength', label: 'Musculação e treino de força' },
        { value: 'aerobic', label: 'Exercícios aeróbicos' },
        { value: 'functional', label: 'Treino funcional' },
        { value: 'varied', label: 'Atividades variadas e circuitos' },
      ],
      rules: { maxSelections: 2 },
    },
    {
      key: 'conditioning_level',
      section: 'training',
      type: 'single',
      prompt: 'Como está o seu condicionamento físico hoje?',
      required: true,
      options: [
        { value: 'very_low', label: 'Muito baixo — canso rapidamente' },
        { value: 'low', label: 'Baixo — consigo fazer atividades leves' },
        { value: 'medium', label: 'Médio — sustento atividades moderadas' },
        { value: 'good', label: 'Bom — tenho boa resistência' },
      ],
    },
    {
      key: 'training_background',
      section: 'training',
      type: 'single',
      prompt: 'Qual experiência com treino melhor representa a sua história?',
      required: true,
      options: [
        { value: 'never_consistent', label: 'Nunca mantive uma prática consistente' },
        { value: 'school_sports', label: 'Pratiquei esportes na escola ou juventude' },
        { value: 'gym_months', label: 'Já treinei em academia por alguns meses' },
        { value: 'diverse_experience', label: 'Tenho experiência em modalidades diferentes' },
      ],
    },
    {
      key: 'training_barrier',
      section: 'training',
      type: 'single',
      prompt: 'O que mais dificulta manter seus treinos?',
      required: true,
      options: [
        { value: 'time', label: 'Falta de tempo na rotina' },
        { value: 'motivation', label: 'Falta de motivação ou disciplina' },
        { value: 'knowledge', label: 'Não saber como treinar' },
        { value: 'fatigue', label: 'Cansaço ou pouca energia' },
      ],
    },
    {
      key: 'training_focus_areas',
      section: 'training',
      type: 'multi',
      prompt: 'Em quais áreas você quer dar mais ênfase no treino?',
      helper: 'Escolha até 2 áreas.',
      required: true,
      options: [
        { value: 'glutes', label: 'Glúteos' },
        { value: 'legs', label: 'Pernas' },
        { value: 'arms', label: 'Braços' },
        { value: 'back', label: 'Costas' },
        { value: 'shoulders', label: 'Ombros' },
        { value: 'chest', label: 'Peito' },
      ],
      rules: { maxSelections: 2 },
    },
  ],
} as const satisfies AnamnesisCatalog

export type AnamnesisStepKey = (typeof catalogDefinition.steps)[number]['key']

export const ANGELA_ANAMNESIS_CATALOG: AnamnesisCatalog = catalogDefinition
