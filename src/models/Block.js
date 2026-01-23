import { type } from "os";

export default (sequelize, DataTypes) => {
  const Block = sequelize.define(
    "Block",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      Height: {
        type: DataTypes.INTEGER,
        unique: true,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
      },
      status: {
        type: DataTypes.STRING,
      },
      Hash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      PreviousHash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      current_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      Timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      MerkleRoot: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      Creator: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Owner_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      ValidatorSignature: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      original_value: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Version: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "Block",
      timestamps: true,
      underscored: false,
    }
  );

  return Block;
};
