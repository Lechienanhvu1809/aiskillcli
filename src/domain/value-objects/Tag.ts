export class Tag {
  public readonly value: string;

  constructor(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("Tag cannot be empty");
    }
    this.value = trimmed.toLowerCase();
  }

  public equals(other: Tag): boolean {
    return this.value === other.value;
  }
}
