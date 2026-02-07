type OverpassTags = Record<string, string>;

type OverpassElement = {
  type: 'way' | 'node' | 'relation';
  id: number;
  tags?: OverpassTags;
};

type OverpassResponse = {
  elements: OverpassElement[];
};

export { };

